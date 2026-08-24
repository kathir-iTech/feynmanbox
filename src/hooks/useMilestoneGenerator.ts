import { generateMilestones } from "../lib/milestoneService"
import { MilestoneState } from "../types"
import { useState } from "react"

export const useMilestoneGenerator = () => {
  const [state, setState] = useState<MilestoneState>({
    success: false,
    milestones: [],
    error: null,
    loading: false,
  })

  const [apiKey, _setApiKey] = useState(() => {
    // Read from environment variable
    return import.meta.env.VITE_GEMINI_API_KEY || ""
  })

  const generate = async (notes: string) => {
    if (!notes.trim()) {
      setState({
        success: false,
        milestones: [],
        error: "Please paste lecture notes first",
        loading: false,
      })
      return
    }

    if (!apiKey) {
      setState({
        success: false,
        milestones: [],
        error: "Gemini API key not configured. Check .env file.",
        loading: false,
      })
      return
    }

    setState({ ...state, loading: true, error: null })

    try {
      const result = await generateMilestones(notes, apiKey)
      setState(result)
    } catch (err: any) {
      setState({
        success: false,
        milestones: [],
        error: err.message || "Unexpected error. Please try again.",
        loading: false,
      })
    }
  }

  const retry = () => {
    // Keep current state but clear error, allow regeneration
    setState({
      success: state.success,
      milestones: state.milestones,
      error: null,
      loading: false,
    })
  }

  return {
    state,
    generate,
    retry,
  }
}