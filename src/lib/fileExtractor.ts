import * as pdfjsLib from "pdfjs-dist"
import mammoth from "mammoth"
// @ts-ignore - Vite handles ?url
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ExtractedResult = {
  text: string
  fileName: string
}

let workerIdCounter = 0

function extractViaWorker(arrayBuffer: ArrayBuffer, fileName: string, fileType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++workerIdCounter
    let worker: Worker
    try {
      worker = new Worker(new URL("./fileParser.worker.ts", import.meta.url), { type: "module" })
    } catch (e) {
      reject(e)
      return
    }

    const timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error("File parsing timed out. Please try a smaller file."))
    }, 30000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      worker.terminate()
    }

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { id: number; text?: string; error?: string }
      if (data.id !== id) return
      cleanup()
      if (data.error) {
        reject(new Error(data.error))
      } else if (typeof data.text === "string") {
        resolve(data.text)
      } else {
        reject(new Error("Unexpected worker response"))
      }
    }

    worker.onerror = (ev) => {
      cleanup()
      reject(new Error(ev.message || "Worker failed to parse file"))
    }

    // Transfer buffer
    try {
      worker.postMessage({ id, arrayBuffer, fileName, fileType }, [arrayBuffer])
    } catch {
      // Fallback without transfer if transfer fails
      worker.postMessage({ id, arrayBuffer, fileName, fileType })
    }
  })
}

async function extractDirect(file: File, arrayBuffer?: ArrayBuffer): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()

  if (name.endsWith(".txt") || type === "text/plain") {
    return await file.text()
  }

  if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buf = arrayBuffer ?? (await file.arrayBuffer())
    const result = await mammoth.extractRawText({ arrayBuffer: buf })
    if (!result.value || !result.value.trim()) {
      throw new Error("No readable text found in the DOCX file.")
    }
    return result.value
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const buf = arrayBuffer ?? (await file.arrayBuffer())
    const loadingTask = pdfjsLib.getDocument({ data: buf })
    const pdf = await loadingTask.promise
    let fullText = ""
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const strings = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ")
      fullText += strings + "\n"
    }
    const cleaned = fullText.trim()
    if (!cleaned) {
      throw new Error("No readable text found in the PDF. It may be a scanned image.")
    }
    return cleaned
  }

  try {
    const text = await file.text()
    if (text.trim().length > 20) return text
  } catch {
    // ignore
  }

  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.")
}

export async function extractTextFromFile(file: File): Promise<string> {
  // Prefer Web Worker to keep UI responsive on large files (Phase 6.3)
  // Main thread posts file to worker, worker performs extraction, posts text back
  if (typeof Worker !== "undefined") {
    try {
      const arrayBuffer = await file.arrayBuffer()
      // For small TXT files, avoid worker overhead
      const isSmallTxt = file.name.toLowerCase().endsWith(".txt") && arrayBuffer.byteLength < 50 * 1024
      if (isSmallTxt) {
        return new TextDecoder().decode(arrayBuffer)
      }
      // Use a copy for direct fallback if worker fails, since transfer detaches buffer
      // We already have arrayBuffer; worker will detach it, so keep fallback via file.text() path
      const workerResult = await extractViaWorker(arrayBuffer, file.name, file.type)
      return workerResult
    } catch (err) {
      // If worker fails, fall back to main-thread extraction (still works, just may jank)
      console.warn("Worker parsing failed, falling back to main thread:", err)
      // For fallback, we need to re-read file since buffer was detached
      try {
        return await extractDirect(file)
      } catch (fallbackErr) {
        // If worker had specific error, prefer that
        if (err instanceof Error) throw err
        throw fallbackErr
      }
    }
  }

  // Fallback when Worker not available
  return extractDirect(file)
}
