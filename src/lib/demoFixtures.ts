// Offline demo fixtures used ONLY when ?demo=true is present in the URL.
// These let the full UI flow be exercised without any network/API dependency.
import type { Milestone } from "../types"
import type { CombinedEvaluationResult } from "./combinedEvaluationService"
import type { FollowUpPair, FollowUpCheck } from "./followUpService"

export const DEMO_MILESTONES: Milestone[] = [
  {
    id: 1,
    text: "A Binary Search Tree is a binary tree where for each node, all values in the left subtree are smaller and all values in the right subtree are larger, enabling ordered search.",
    covered: false,
    importance: "core",
    sourceReference:
      "A binary search tree (BST) is a binary tree in which each node has at most two children and, for every node, all keys in the left subtree are less than the node's key and all keys in the right subtree are greater.",
  },
  {
    id: 2,
    text: "Searching in a BST compares the target with the current node and recurses left or right, achieving O(log n) average time but O(n) worst-case when unbalanced.",
    covered: false,
    importance: "core",
    sourceReference:
      "Search begins at the root and compares the target to the current node, moving left if smaller and right if larger. Average-case time is O(log n), degrading to O(n) when the tree is unbalanced.",
  },
  {
    id: 3,
    text: "Insertion finds the correct leaf position by comparing values and inserts the new node while preserving the BST ordering property.",
    covered: false,
    importance: "supporting",
    sourceReference:
      "To insert, walk down from the root comparing keys and place the new node in the first empty spot that preserves the ordering property.",
  },
  {
    id: 4,
    text: "Deletion handles three cases: leaf removal, single-child replacement, and two-child replacement using the inorder successor or predecessor.",
    covered: false,
    importance: "supporting",
    sourceReference:
      "Deletion must handle a leaf (simply remove), a node with one child (replace with that child), and a node with two children (replace with the inorder successor or predecessor).",
  },
  {
    id: 5,
    text: "Balanced BSTs like AVL or Red-Black trees maintain O(log n) height via rotations, unlike degenerate BSTs that degrade to linked lists on sorted input.",
    covered: false,
    importance: "core",
    sourceReference:
      "Self-balancing trees such as AVL and Red-Black trees use rotations to keep height O(log n); an ordinary BST given sorted input degenerates into a linked list with O(n) height.",
  },
]

export const DEMO_TRANSCRIPT =
  "A binary search tree is a binary tree where each node's left subtree contains only smaller values and the right subtree contains only larger values, because this ordering lets us search efficiently. To search, we compare the target with the current node, so if it's smaller we go left, if larger we go right, therefore we cut the search space in half each time, which gives O log n on average, but if the tree is unbalanced it degrades to O n. Insertion works the same way: we compare and walk down until we find an empty spot, then insert there, so the ordering is preserved. Balanced trees like AVL fix the worst case by doing rotations to keep height log n. I'm less sure about the details of deletion though."

export const DEMO_SUBJECT_DOMAIN: "technical" = "technical"

export function demoEvaluationResult(): CombinedEvaluationResult {
  return {
    coverage_score: 72,
    factual_accuracy_score: 100,
    reasoning_quality_score: 70,
    clarity_score: 75,
    is_gaming_attempt: false,
    reasoning:
      "The explanation connects ideas with causal language (because, therefore, so) and shows genuine understanding of search and ordering. It does not exhibit a disconnected keyword-dumping pattern.",
    summary:
      "You have a solid grasp of BST ordering, search, and balancing, but you did not address deletion, which is a core concept worth reviewing.",
    details: [
      {
        concept: DEMO_MILESTONES[0].text,
        covered: true,
        sub_score: 25,
        max_score: 25,
        is_factually_correct: true,
        verifiable_from_source: true,
        feedback: "Clearly explained the left-smaller / right-larger ordering and why it enables search.",
        reasoning_feedback: "Connected the ordering property to efficient search — strong causal reasoning.",
        source_reference: DEMO_MILESTONES[0].sourceReference,
      },
      {
        concept: DEMO_MILESTONES[1].text,
        covered: true,
        sub_score: 18,
        max_score: 25,
        is_factually_correct: true,
        verifiable_from_source: true,
        feedback: "Correctly described comparison-based search and the O(log n) average / O(n) worst case.",
        reasoning_feedback: "Explained the mechanism (cut search space in half) rather than just stating the bound.",
        source_reference: DEMO_MILESTONES[1].sourceReference,
      },
      {
        concept: DEMO_MILESTONES[2].text,
        covered: true,
        sub_score: 13,
        max_score: 13,
        is_factually_correct: true,
        verifiable_from_source: true,
        feedback: "Described walking down and inserting at the empty spot while preserving ordering.",
        reasoning_feedback: "Adequately explained, though briefly.",
        source_reference: DEMO_MILESTONES[2].sourceReference,
      },
      {
        concept: DEMO_MILESTONES[3].text,
        covered: false,
        sub_score: 0,
        max_score: 12,
        is_factually_correct: true,
        verifiable_from_source: true,
        feedback: "Not addressed — review the three deletion cases (leaf, single child, two children with inorder successor).",
        reasoning_feedback: "No reasoning shown for deletion; it was skipped.",
        source_reference: DEMO_MILESTONES[3].sourceReference,
      },
      {
        concept: DEMO_MILESTONES[4].text,
        covered: true,
        sub_score: 16,
        max_score: 25,
        is_factually_correct: true,
        verifiable_from_source: true,
        feedback: "Correctly noted AVL uses rotations to keep height O(log n) and that sorted input can degenerate a plain BST.",
        reasoning_feedback: "Connected balancing to the worst-case degeneration — good insight.",
        source_reference: DEMO_MILESTONES[4].sourceReference,
      },
    ],
    milestones_covered: [true, true, true, false, true],
    confidence: "high",
    subject_domain: "technical",
    acousticMetrics: {
      wordsPerMinute: 138,
      pauseCount: 3,
      totalPauseDuration: 1200,
      pitchVarianceScore: 46,
      recordingDurationMs: 22000,
    },
  }
}

export function demoFollowUpPair(): FollowUpPair {
  return {
    remediation:
      "You mentioned deletion was unclear — can you walk through what happens when you delete a node that has two children, using the inorder successor?",
    transfer:
      "You explained BST search well — now suppose we switched from a tree to a B-tree with nodes holding many keys; how would the 'go left or right' decision change at each node?",
  }
}

export function demoFollowUpCheck(): FollowUpCheck {
  return {
    covered: true,
    feedback: "Now correctly explained the two-child deletion case using the inorder successor.",
  }
}
