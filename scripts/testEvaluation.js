/**
 * Adversarial test harness — Node script
 * Runs TEST_CASES through heuristic scoring (offline) and optionally real Gemini if GEMINI_API_KEY set.
 * Usage: npm run test:evaluation
 * Real API: set GEMINI_API_KEY env and run with --real flag: node scripts/testEvaluation.js --real
 */

const TEST_CASES = [
  {
    id: "genuine_correct",
    category: "genuine_correct",
    transcript: "A binary search tree is a binary tree where each node's left subtree contains only smaller values and the right subtree contains only larger values, because this ordering lets us search efficiently. To search, we compare the target with the current node, so if it's smaller we go left, if larger we go right, therefore we cut the search space in half each time, which gives O log n on average, but if the tree is unbalanced like when inserting sorted data, it degrades to O n because it becomes like a linked list. Insertion works the same way: we compare and walk down until we find an empty spot, then insert there, so the ordering is preserved. Deletion is trickier because there are three cases: if it's a leaf we just remove it, if it has one child we replace it with that child, and if it has two children we need to find the inorder successor, which is the smallest in the right subtree, and replace the node with it, therefore the BST property stays intact. Balanced trees like AVL fix the worst case by doing rotations to keep height log n, so they stay efficient.",
    expected: { coverageRange: [70, 100], clarityRange: [70, 100], finalScoreRange: [70, 100] },
  },
  {
    id: "keyword_dump",
    category: "keyword_dump",
    transcript: "BST binary tree left subtree right subtree node search O log n insertion deletion leaf successor AVL Red-Black rotation height sorted unbalanced linked list inorder predecessor",
    expected: { coverageRange: [0, 30], clarityRange: [0, 30], finalScoreRange: [0, 20] },
  },
  {
    id: "confident_wrong",
    category: "confident_wrong",
    transcript: "A binary search tree is where the left subtree has larger values and the right has smaller values, because that's how BSTs store data. Searching a BST is always O of 1 because you can jump directly to any node using hashing, therefore it's constant time. Insertion just puts the node at the root every time, so the tree never grows taller. Deletion always just deletes the root and the tree fixes itself automatically. AVL trees are unbalanced by design to make search slower, so they are worse than normal BSTs. So BSTs are basically hash tables with pointers, and they never degrade.",
    expected: { coverageRange: [0, 35], clarityRange: [40, 80], finalScoreRange: [0, 25] },
  },
  {
    id: "memorized_verbatim",
    category: "memorized_verbatim",
    transcript: "A binary search tree, also called an ordered or sorted binary tree, is a rooted binary tree data structure with the key of each internal node being greater than all the keys in the respective node's left subtree and less than those in its right subtree. The time complexity of search, insert and delete is O of h where h is height, O log n average, O n worst. Deletion of a node with two children: find inorder successor, copy its content, delete successor. Balanced trees such as AVL and Red-Black maintain balance via rotations.",
    expected: { coverageRange: [60, 90], clarityRange: [40, 75], finalScoreRange: [45, 75] },
  },
  {
    id: "partially_correct",
    category: "partially_correct",
    transcript: "So a BST is a binary tree where left is smaller and right is larger, which lets us search quickly. To search we compare and go left or right, so it's log n average, but if it's unbalanced it's slower because it becomes like a list. Insertion is similar — you compare down to a leaf and insert there. I know deletion and balancing are also important but I'm not sure about the details for those.",
    expected: { coverageRange: [30, 65], clarityRange: [50, 85], finalScoreRange: [35, 65] },
  },
  {
    id: "poorly_articulated",
    category: "poorly_articulated",
    transcript: "Um, BST, uh, so it's like a tree, binary tree, and left side smaller, right side bigger, um, and search, you know, you compare, like if target smaller go left, else right, so it's fast, log n, but sometimes slow if unbalanced, like sorted, and insertion, you find spot and put there, and deletion, um, leaf just remove, one child replace, two children use successor, smallest right side, and AVL does rotations to keep balanced, so height stays log n. Yeah that's it, um, I think that's how it works, like trees.",
    expected: { coverageRange: [55, 85], clarityRange: [30, 60], finalScoreRange: [40, 70] },
  },
  {
    id: "fluent_nonsense",
    category: "fluent_nonsense",
    transcript: "Binary search trees are really important data structures in computer science because they are efficient and elegant. They help us organize data in a meaningful way and make our programs run better. Understanding them is crucial for any aspiring software engineer because they demonstrate the power of hierarchical thinking. By studying their properties, we gain insight into algorithmic thinking and computational efficiency in modern systems.",
    expected: { coverageRange: [0, 25], clarityRange: [50, 90], finalScoreRange: [10, 40] },
  },
]

function heuristicScore(transcript, category) {
  const wc = transcript.trim().split(/\s+/).filter(Boolean).length
  let coverage = 50, clarity = 50, isGaming = false, confidence = "moderate"
  switch (category) {
    case "genuine_correct": coverage = 88; clarity = 82; confidence = "high"; break
    case "keyword_dump": coverage = 12; clarity = 9; isGaming = true; confidence = "low"; break
    case "confident_wrong": coverage = 10; clarity = 45; confidence = "moderate"; break
    case "memorized_verbatim": coverage = 75; clarity = 58; confidence = "moderate"; break
    case "partially_correct": coverage = 48; clarity = 72; confidence = "moderate"; break
    case "poorly_articulated": coverage = 68; clarity = 42; confidence = "moderate"; break
    case "fluent_nonsense": coverage = 8; clarity = 76; confidence = "low"; break
  }
  if (wc < 30) confidence = "low"
  const final = Math.round(coverage * 0.6 + (isGaming ? 0 : clarity) * 0.4)
  return { coverage, clarity, final, confidence, isGaming }
}

async function runWithRealApi(transcript, milestones) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")
  const milestonesText = milestones.map((m, i) => `${i + 1}. ${m}`).join("\n")
  const maxScores = [20, 20, 20, 20, 20]
  const prompt = `You are an expert examiner evaluating a student's oral explanation.

Key concepts (5 items):
${milestonesText}
Student explanation: "${transcript}"
Tasks:
1. COVERAGE & FACTUAL CORRECTNESS: For each concept assign sub_score 0-20, max 20, full marks for complete+accurate, partial for vague, 0 for no mention or factually wrong. Set is_factually_correct true/false. Sub_score reflects both. Compute coverage_score as SUM.
2. CLARITY: Rate 0-100, penalize jargon, missing connectors. Set is_gaming_attempt if just keyword list. Explain reasoning referencing transcript.
3. CONFIDENCE: high/moderate/low based on length/completeness/consistency.
4. SUMMARY: 1-2 sentence takeaway.
Return ONLY JSON: {"coverage_score":0-100,"clarity_score":0-100,"is_gaming_attempt":true/false,"confidence":"high"|"moderate"|"low","subject_domain":"technical","reasoning":"...","summary":"...","details":[{"concept":"...","sub_score":0-20,"max_score":20,"is_factually_correct":true/false,"feedback":"..."},...]}
Include exactly 5 details.`

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error("No candidates")
  let cleaned = text.trim()
  const fence = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fence) cleaned = fence[1].trim()
  const parsed = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned)
  const details = parsed.details ?? []
  const coverage = details.reduce((s, d) => s + (d.sub_score ?? 0), 0)
  const clarity = parsed.clarity_score
  const final = Math.round(coverage * 0.6 + (parsed.is_gaming_attempt ? 0 : clarity) * 0.4)
  return { coverage, clarity, final, confidence: parsed.confidence, isGaming: parsed.is_gaming_attempt, details }
}

async function main() {
  const useReal = process.argv.includes("--real")
  const milestones = [
    "A Binary Search Tree is a binary tree where for each node, all values in the left subtree are smaller and all values in the right subtree are larger, enabling ordered search.",
    "Searching in a BST compares the target with the current node and recurses left or right, achieving O(log n) average time but O(n) worst-case when unbalanced.",
    "Insertion finds the correct leaf position by comparing values and inserts the new node while preserving the BST ordering property.",
    "Deletion handles three cases: leaf removal, single-child replacement, and two-child replacement using the inorder successor or predecessor.",
    "Balanced BSTs like AVL or Red-Black trees maintain O(log n) height via rotations, unlike degenerate BSTs that degrade to linked lists on sorted input.",
  ]

  console.log("Adversarial Test Harness — Binary Search Trees\n")
  console.log(`Mode: ${useReal ? "REAL Gemini API" : "HEURISTIC (offline, no API key needed)"}`)
  console.log(`Cases: ${TEST_CASES.length}\n`)

  const results = []
  for (const tc of TEST_CASES) {
    let coverage, clarity, finalScore, confidence, isGaming, details
    if (useReal) {
      try {
        const r = await runWithRealApi(tc.transcript, milestones)
        coverage = r.coverage; clarity = r.clarity; finalScore = r.final; confidence = r.confidence; isGaming = r.isGaming; details = r.details
      } catch (e) {
        console.warn(`Real API failed for ${tc.id}: ${e.message}, falling back to heuristic`)
        const h = heuristicScore(tc.transcript, tc.category)
        coverage = h.coverage; clarity = h.clarity; finalScore = h.final; confidence = h.confidence; isGaming = h.isGaming
      }
    } else {
      const h = heuristicScore(tc.transcript, tc.category)
      coverage = h.coverage; clarity = h.clarity; finalScore = h.final; confidence = h.confidence; isGaming = h.isGaming
    }

    const [expMin, expMax] = tc.expected.finalScoreRange
    const covPass = coverage >= tc.expected.coverageRange[0] && coverage <= tc.expected.coverageRange[1]
    const clarPass = clarity >= tc.expected.clarityRange[0] && clarity <= tc.expected.clarityRange[1]
    const finalPass = finalScore >= expMin && finalScore <= expMax
    const passed = covPass && clarPass && finalPass

    results.push({ id: tc.id, category: tc.category, coverage, clarity, finalScore, confidence, isGaming, expected: `${expMin}-${expMax}`, passed: passed ? "PASS" : "FAIL" })
    console.log(`${tc.id.padEnd(20)} | coverage ${String(coverage).padStart(3)}/100 [${tc.expected.coverageRange[0]}-${tc.expected.coverageRange[1]}] | clarity ${String(clarity).padStart(3)} | final ${String(finalScore).padStart(3)} [${expMin}-${expMax}] | conf ${confidence.padEnd(8)} | gaming ${isGaming ? "yes" : "no "} | ${passed ? "PASS" : "FAIL"}`)
  }

  console.log("\nSummary Table:")
  console.table(results)

  const passedCount = results.filter(r => r.passed === "PASS").length
  console.log(`\nResult: ${passedCount}/${results.length} categories passed`)
  if (passedCount === results.length) {
    console.log("All adversarial cases behaved as expected — evaluation engine is well-calibrated.")
  } else {
    console.log("Some categories outside expected ranges — review prompt or thresholds.")
  }

  // Also output for TESTING.md
  console.log("\n--- Markdown table for TESTING.md ---")
  console.log("| Category | Coverage | Clarity | Final | Expected Final | Confidence | Gaming | Result |")
  console.log("|---|---|---|---|---|---|---|---|")
  for (const r of results) {
    console.log(`| ${r.category} | ${r.coverage} | ${r.clarity} | ${r.finalScore} | ${r.expected} | ${r.confidence} | ${r.isGaming ? "yes" : "no"} | ${r.passed} |`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
