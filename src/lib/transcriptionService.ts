const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string,
  apiKey: string
): Promise<string> {
  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Audio,
            },
          },
          {
            text: "Transcribe this spoken audio word-for-word as accurately as possible. If any word is unclear, transcribe your best guess rather than omitting it. Do not add punctuation or formatting beyond what's spoken. Return only the transcript text.",
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
    },
  }

  const response = await fetch(`${API_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error("We couldn't transcribe your audio. Please try again.")
  }

  const data = await response.json()

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("We couldn't transcribe your audio. Please try again.")
  }

  const text = data.candidates[0]?.content?.parts?.[0]?.text
  if (!text || !text.trim()) {
    throw new Error("No speech was detected. Please try recording again.")
  }

  return text.trim()
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // result is data:audio/webm;base64,XXXX
      const base64 = result.split(",")[1]
      if (!base64) {
        reject(new Error("Failed to encode audio."))
      } else {
        resolve(base64)
      }
    }
    reader.onerror = () => reject(new Error("Failed to read audio."))
    reader.readAsDataURL(blob)
  })
}
