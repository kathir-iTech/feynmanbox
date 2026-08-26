import * as pdfjsLib from "pdfjs-dist"
import mammoth from "mammoth"
// @ts-ignore - Vite handles ?url
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Worker message handling: expects { id, arrayBuffer, fileName, fileType }
self.onmessage = async (e: MessageEvent) => {
  const { id, arrayBuffer, fileName, fileType } = e.data as {
    id: number
    arrayBuffer: ArrayBuffer
    fileName: string
    fileType: string
  }
  try {
    const name = fileName.toLowerCase()
    const type = fileType.toLowerCase()
    let text = ""

    if (name.endsWith(".txt") || type === "text/plain") {
      text = new TextDecoder().decode(arrayBuffer)
    } else if (
      name.endsWith(".docx") ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ arrayBuffer })
      if (!result.value || !result.value.trim()) {
        throw new Error("No readable text found in the DOCX file.")
      }
      text = result.value
    } else if (name.endsWith(".pdf") || type === "application/pdf") {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
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
      text = cleaned
    } else {
      // Fallback: try as text
      try {
        const decoded = new TextDecoder().decode(arrayBuffer)
        if (decoded.trim().length > 20) {
          text = decoded
        } else {
          throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.")
        }
      } catch {
        throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.")
      }
    }

    // Post back
    ;(self as any).postMessage({ id, text })
  } catch (err: any) {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Failed to parse file"
    ;(self as any).postMessage({ id, error: message })
  }
}
