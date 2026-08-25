import * as pdfjsLib from "pdfjs-dist"
import mammoth from "mammoth"
// @ts-ignore - Vite handles ?url
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ExtractedResult = {
  text: string
  fileName: string
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()

  if (name.endsWith(".txt") || type === "text/plain") {
    return await file.text()
  }

  if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    if (!result.value || !result.value.trim()) {
      throw new Error("No readable text found in the DOCX file.")
    }
    return result.value
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const arrayBuffer = await file.arrayBuffer()
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
    return cleaned
  }

  // Fallback: try as text
  try {
    const text = await file.text()
    if (text.trim().length > 20) return text
  } catch {
    // ignore
  }

  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.")
}
