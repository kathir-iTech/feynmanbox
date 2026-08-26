/**
 * Adversarial test harness — predefined transcripts for shared reference concept: Binary Search Trees
 * Each case labeled with intended category for validation against evaluation engine.
 */

export type TestCategory =
  | "genuine_correct"
  | "keyword_dump"
  | "confident_wrong"
  | "memorized_verbatim"
  | "partially_correct"
  | "poorly_articulated"
  | "fluent_nonsense"

export interface TestCase {
  id: string
  category: TestCategory
  label: string
  description: string
  transcript: string
  expected: {
    coverageRange: [number, number] // expected coverage_score range 0-100
    clarityRange: [number, number]
    finalScoreRange: [number, number]
    confidence?: "high" | "moderate" | "low"
    shouldFlagGaming?: boolean
    shouldMarkFactuallyIncorrect?: boolean
  }
}

// Shared BST milestones (5 concepts) — used as reference for all test cases
export const BST_MILESTONES = [
  "A Binary Search Tree is a binary tree where for each node, all values in the left subtree are smaller and all values in the right subtree are larger, enabling ordered search.",
  "Searching in a BST compares the target with the current node and recurses left or right, achieving O(log n) average time but O(n) worst-case when unbalanced.",
  "Insertion finds the correct leaf position by comparing values and inserts the new node while preserving the BST ordering property.",
  "Deletion handles three cases: leaf removal, single-child replacement, and two-child replacement using the inorder successor or predecessor.",
  "Balanced BSTs like AVL or Red-Black trees maintain O(log n) height via rotations, unlike degenerate BSTs that degrade to linked lists on sorted input.",
]

export const BST_SUBJECT_DOMAIN = "technical" as const

export const TEST_CASES: TestCase[] = [
  {
    id: "genuine_correct",
    category: "genuine_correct",
    label: "Genuine Correct — clear, accurate, well-connected",
    description: "A student explains BSTs accurately with causal connectors and personal understanding.",
    transcript:
      "A binary search tree is a binary tree where each node's left subtree contains only smaller values and the right subtree contains only larger values, because this ordering lets us search efficiently. To search, we compare the target with the current node, so if it's smaller we go left, if larger we go right, therefore we cut the search space in half each time, which gives O log n on average, but if the tree is unbalanced like when inserting sorted data, it degrades to O n because it becomes like a linked list. Insertion works the same way: we compare and walk down until we find an empty spot, then insert there, so the ordering is preserved. Deletion is trickier because there are three cases: if it's a leaf we just remove it, if it has one child we replace it with that child, and if it has two children we need to find the inorder successor, which is the smallest in the right subtree, and replace the node with it, therefore the BST property stays intact. Balanced trees like AVL fix the worst case by doing rotations to keep height log n, so they stay efficient.",
    expected: {
      coverageRange: [70, 100],
      clarityRange: [70, 100],
      finalScoreRange: [70, 100],
      confidence: "high",
      shouldFlagGaming: false,
    },
  },
  {
    id: "keyword_dump",
    category: "keyword_dump",
    label: "Keyword Dump — disconnected jargon, no connectors",
    description: "Student lists BST keywords without sentences or logical flow.",
    transcript: "BST binary tree left subtree right subtree node search O log n insertion deletion leaf successor AVL Red-Black rotation height sorted unbalanced linked list inorder predecessor",
    expected: {
      coverageRange: [0, 30],
      clarityRange: [0, 30],
      finalScoreRange: [0, 20],
      confidence: "low",
      shouldFlagGaming: true,
    },
  },
  {
    id: "confident_wrong",
    category: "confident_wrong",
    label: "Confident Wrong — fluent but factually incorrect",
    description: "Student is fluent but makes confident factual errors about BSTs.",
    transcript:
      "A binary search tree is where the left subtree has larger values and the right has smaller values, because that's how BSTs store data. Searching a BST is always O of 1 because you can jump directly to any node using hashing, therefore it's constant time. Insertion just puts the node at the root every time, so the tree never grows taller. Deletion always just deletes the root and the tree fixes itself automatically. AVL trees are unbalanced by design to make search slower, so they are worse than normal BSTs. So BSTs are basically hash tables with pointers, and they never degrade.",
    expected: {
      coverageRange: [0, 35],
      clarityRange: [40, 80],
      finalScoreRange: [0, 25],
      confidence: "moderate",
      shouldMarkFactuallyIncorrect: true,
    },
  },
  {
    id: "memorized_verbatim",
    category: "memorized_verbatim",
    label: "Memorized Verbatim — textbook recitation, no personalization",
    description: "Word-for-word textbook definition, very fast with no pauses, suggests memorization not understanding.",
    transcript:
      "A binary search tree, also called an ordered or sorted binary tree, is a rooted binary tree data structure with the key of each internal node being greater than all the keys in the respective node's left subtree and less than those in its right subtree. The time complexity of search, insert and delete is O of h where h is height, O log n average, O n worst. Deletion of a node with two children: find inorder successor, copy its content, delete successor. Balanced trees such as AVL and Red-Black maintain balance via rotations.",
    expected: {
      coverageRange: [60, 90],
      clarityRange: [40, 75],
      finalScoreRange: [45, 75],
      confidence: "moderate",
      shouldFlagGaming: false,
    },
  },
  {
    id: "partially_correct",
    category: "partially_correct",
    label: "Partially Correct — covers some concepts accurately, misses others",
    description: "Student explains search and insertion well but misses deletion and balancing.",
    transcript:
      "So a BST is a binary tree where left is smaller and right is larger, which lets us search quickly. To search we compare and go left or right, so it's log n average, but if it's unbalanced it's slower because it becomes like a list. Insertion is similar — you compare down to a leaf and insert there. I know deletion and balancing are also important but I'm not sure about the details for those.",
    expected: {
      coverageRange: [30, 65],
      clarityRange: [50, 85],
      finalScoreRange: [35, 65],
      confidence: "moderate",
    },
  },
  {
    id: "poorly_articulated",
    category: "poorly_articulated",
    label: "Poorly Articulated — correct ideas, weak delivery/structure",
    description: "Technically correct but rambling, repetitive, weak structure, many fillers.",
    transcript:
      "Um, BST, uh, so it's like a tree, binary tree, and left side smaller, right side bigger, um, and search, you know, you compare, like if target smaller go left, else right, so it's fast, log n, but sometimes slow if unbalanced, like sorted, and insertion, you find spot and put there, and deletion, um, leaf just remove, one child replace, two children use successor, smallest right side, and AVL does rotations to keep balanced, so height stays log n. Yeah that's it, um, I think that's how it works, like trees.",
    expected: {
      coverageRange: [55, 85],
      clarityRange: [30, 60],
      finalScoreRange: [40, 70],
      confidence: "moderate",
    },
  },
  {
    id: "fluent_nonsense",
    category: "fluent_nonsense",
    label: "Fluent Nonsense — grammatically smooth but conceptually empty",
    description: "Sounds fluent but says nothing substantive about BST mechanics.",
    transcript:
      "Binary search trees are really important data structures in computer science because they are efficient and elegant. They help us organize data in a meaningful way and make our programs run better. Understanding them is crucial for any aspiring software engineer because they demonstrate the power of hierarchical thinking. By studying their properties, we gain insight into algorithmic thinking and computational efficiency in modern systems.",
    expected: {
      coverageRange: [0, 25],
      clarityRange: [50, 90],
      finalScoreRange: [10, 40],
      confidence: "low",
    },
  },
]

export const EXPECTED_RANGES: Record<TestCategory, { coverage: [number, number]; clarity: [number, number]; final: [number, number] }> = {
  genuine_correct: { coverage: [70, 100], clarity: [70, 100], final: [60, 100] },
  keyword_dump: { coverage: [0, 30], clarity: [0, 30], final: [0, 15] },
  confident_wrong: { coverage: [0, 35], clarity: [30, 80], final: [0, 25] },
  memorized_verbatim: { coverage: [60, 90], clarity: [40, 75], final: [40, 75] },
  partially_correct: { coverage: [30, 65], clarity: [50, 85], final: [30, 65] },
  poorly_articulated: { coverage: [55, 85], clarity: [30, 60], final: [35, 70] },
  fluent_nonsense: { coverage: [0, 25], clarity: [50, 90], final: [10, 40] },
}
