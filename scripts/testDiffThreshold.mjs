// Unit test for the word-level diff-ratio threshold used by the immutable-transcript flag (Phase 8.1).
// Replicates computeWordDiffRatio from src/App.tsx.

function computeWordDiffRatio(a, b) {
  const tokenize = (s) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
  const aw = tokenize(a)
  const bw = tokenize(b)
  const maxLen = Math.max(aw.length, bw.length, 1)
  const dp = Array.from({ length: bw.length + 1 }, (_, i) => i)
  for (let i = 1; i <= aw.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= bw.length; j++) {
      const temp = dp[j]
      const cost = aw[i - 1] === bw[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
      prev = temp
    }
  }
  return dp[bw.length] / maxLen
}

const THRESHOLD = 0.15

const original =
  "A binary search tree is a binary tree where the left subtree has smaller values and the right subtree has larger values so search is efficient. Search compares and goes left or right giving log n average but can degrade to n. Insertion walks down and inserts at a leaf. Balanced trees like AVL use rotations to keep height log n."

const smallEdit = original.replace("smaller values", "smaller numbers").replace("larger values", "larger numbers")
const typoFix = original.replace("search is efficient", "search is efficient") // no-op
const largeRewrite =
  "I think trees are data structures. Computers use them. Algorithms are important. Programming is fun. I like sorting. Maybe binary something. Trees help. Code is good. Data goes in places. Nodes connect. I'm not sure about the details honestly."

const r1 = computeWordDiffRatio(original, smallEdit)
const r2 = computeWordDiffRatio(original, typoFix)
const r3 = computeWordDiffRatio(original, largeRewrite)

console.log("=== DIFF-THRESHOLD TEST (Phase 8.1) ===")
console.log(`Small wording edit  ratio=${r1.toFixed(3)}  flagged=${r1 > THRESHOLD}  (expect false)`)
console.log(`No-op edit          ratio=${r2.toFixed(3)}  flagged=${r2 > THRESHOLD}  (expect false)`)
console.log(`Large rewrite       ratio=${r3.toFixed(3)}  flagged=${r3 > THRESHOLD}  (expect true)`)

const pass = r1 <= THRESHOLD && r2 <= THRESHOLD && r3 > THRESHOLD
console.log(pass ? "RESULT: PASS — minor corrections not flagged, large rewrites flagged" : "RESULT: FAIL")
process.exit(pass ? 0 : 1)
