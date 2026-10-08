export const notionExercises = [
  {
    "id": "3efe8a375ff5812dab8bdf34fe48b198",
    "title": "01 — Validate an invoice draft",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5812dab8bdf34fe48b198",
    "platform": "Practical Interview Prep",
    "topics": [
      "Validation"
    ],
    "notes": "TypeScript • 45 min • Start here. Brief, checks, hints and reference solution inside.",
    "content": "\n## Brief\n**Track:** TypeScript / business logic. **Level:** junior, intermediate stretch. **Time:** 45 minutes core + optional 20-minute extension.\nYou work on a fictional SaaS invoicing tool. Validate an invoice draft before it is saved. This mirrors the form validation and business rules in your EPSA experience.\n## Contract and rules\nImplement validateInvoice(input: InvoiceDraft): ValidationResult. The input is typed application data; validating arbitrary JSON is an optional extension.\n- customerId and each description must contain non-whitespace text. Trim these strings in successful output.\n- There must be at least one line.\n- quantity must be a safe integer from 1 to 1,000.\n- unitPriceCents must be a safe integer from 0 to 1,000,000. Free items are allowed.\n- vatRate must be exactly 0, 5.5, 10, or 20. These are exercise rules, not tax advice.\n- Return all validation errors, using paths such as lines.0.quantity. Do not throw for invalid field values.\n- Do not mutate the input. Ignore totals for the core task.\n## Starter types\n```typescript\ntype Line = { description: string; quantity: number; unitPriceCents: number; vatRate: number };\ntype InvoiceDraft = { customerId: string; lines: Line[] };\ntype ValidationResult =\n  | { ok: true; data: InvoiceDraft }\n  | { ok: false; errors: Record<string, string> };\n\nexport function validateInvoice(input: InvoiceDraft): ValidationResult {\n  throw new Error(\"TODO\");\n}\n```\n## Acceptance checks\n- [ ] A customer \" acme \" and a valid description \" Support \" succeed with trimmed output.\n- [ ] A blank customer and an empty line array return both errors.\n- [ ] A row with an empty description, quantity 0, price -1, and VAT 7 returns four row errors.\n- [ ] Reject quantity 1.5, NaN, Infinity, and an unsafe integer.\n- [ ] Accept price 0 and VAT 5.5.\n- [ ] Compare the input before and after validation: it must remain unchanged.\n## Optional extension\nCalculate each line net amount in integer cents, then line VAT as Math.round(net \\* vatRate / 100). Sum the rounded line VAT and net amounts for the invoice. Two items at 999 cents with VAT 20 produce net 1998, VAT 400, gross 2398 cents. Document rounding; reject any unsafe intermediate or aggregate integer. Add unknown-input validation without using any.\n<details>\n<summary>Hint — open only after trying</summary>\n\tBuild an errors object while visiting every field. Check Object.keys(errors).length only after validation finishes. A discriminated union lets the caller narrow the result using ok.\n</details>\n<details>\n<summary>Reference solution — core only</summary>\n\t```typescript\nexport function validateInvoice(input: InvoiceDraft): ValidationResult {\n  const errors: Record<string, string> = {};\n  if (!input.customerId.trim()) errors.customerId = \"Required\";\n  if (input.lines.length === 0) errors.lines = \"Add at least one line\";\n  input.lines.forEach((line, i) => {\n    const path = \"lines.\" + i + \".\";\n    if (!line.description.trim()) errors[path + \"description\"] = \"Required\";\n    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000)\n      errors[path + \"quantity\"] = \"Integer from 1 to 1000 required\";\n    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0 || line.unitPriceCents > 1000000)\n      errors[path + \"unitPriceCents\"] = \"Integer from 0 to 1000000 required\";\n    if (![0, 5.5, 10, 20].includes(line.vatRate))\n      errors[path + \"vatRate\"] = \"Unsupported VAT rate\";\n  });\n  if (Object.keys(errors).length) return { ok: false, errors };\n  return {\n    ok: true,\n    data: {\n      customerId: input.customerId.trim(),\n      lines: input.lines.map(line => ({ ...line, description: line.description.trim() }))\n    }\n  };\n}\n\t```\n</details>\n## Interview follow-ups\nWhy store money as integer cents? What does TypeScript fail to validate at runtime? Where should validation live when both browser and server accept the same data? Which tests establish business behavior?\n## Where to code\nUse VS Code. Create a personal folder called practical-interview-prep in your usual development directory and open that folder. Keep one subfolder per exercise: 01-invoice-validation, 02-customer-search, 03-sql-reporting.\nFor TypeScript, use a small TypeScript project with your usual runner and test setup. For React, use a React + TypeScript app and preview it in your browser. For SQL, write .sql files in VS Code and execute them against a local PostgreSQL practice database using your usual database client or psql. Editing SQL alone does not execute it.\nThe initial environment setup is outside the exercise timer. No deployment is needed. Notion stores your brief and progress; your local folder stores your code. They do not sync automatically.\n## Practice and review\nFirst attempt: documentation allowed; try before opening hints or solutions. Record any assistance. For a later interview simulation, agree the allowed tools before starting.\n- [ ] Read the brief and explain your approach aloud.\n- [ ] Implement the core requirements within the suggested time.\n- [ ] Check the supplied examples and add edge cases.\n- [ ] Explain one tradeoff and one improvement in two minutes.\n- [ ] Ask for a review using your code or repository link.\nUpdate Status and Last practised after an attempt; put the actual duration in Latest time (min). Mark Review needed when you want to revisit a gap. Use Link for your repository or relevant file link once one exists.\n## Attempt log\nDate:\nActual minutes:\nHelp used:\nWhat worked:\nWhat failed:\nWhat I would improve:\nCode/repository link:\nReview notes:\n```javascript\nexport function validateInvoice(input: InvoiceDraft): ValidationResult {\n  const errors: Record<string, string> = {};\n  let result: InvoiceDraft = {\n    customerId: input.customerId.trim(),\n    lines: [],\n  };\n\n  if (!result.customerId.length)\n    errors[\"customerId\"] = \"required the customer id\";\n\n  if (!input.lines.length)\n    errors[\"lines\"] = \"At least one line is required\";\n\n  for (const [i, line] of input.lines.entries()) {\n    const description = line!.description.trim();\n    if (!description.length)\n      errors[`lines.${i}.description`] = \"Description is required\";\n\n    if (\n      line.quantity < 1 ||\n      line.quantity > 1000 ||\n      !Number.isSafeInteger(line.quantity)\n    )\n      errors[`lines.${i}.quantity`] =\n        \"Quantity must be an integer between 1 and 1000\";\n\n    if (\n      line.unitPriceCents < 0 ||\n      line.unitPriceCents > 1_000_000 ||\n      !Number.isSafeInteger(line.unitPriceCents)\n    )\n      errors[`lines.${i}.unitPriceCents`] =\n        \"unity price must be between 0 and 1000000\";\n\n    if (![0, 5.5, 10, 20].includes(line.vatRate))\n      errors[`lines.${i}.vatRate`] = \"VAT rate must be 0, 5.5, 10, 20\";\n    result.lines.push({\n      description,\n      quantity: line!.quantity,\n      unitPriceCents: line!.unitPriceCents,\n      vatRate: line!.vatRate,\n    });\n  }\n\n  if (Object.keys(errors).length) {\n    return { ok: false, errors };\n  }\n  return { ok: true, data: result };\n}\n```\n"
  },
  {
    "id": "3efe8a375ff581b581b8c3330f3dc0ca",
    "title": "02 — Build a resilient customer search",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581b581b8c3330f3dc0ca",
    "platform": "Practical Interview Prep",
    "topics": [
      "State"
    ],
    "notes": "React + TypeScript • 60 min • Loading, errors, retry and stale responses.",
    "content": "\n## Brief\n**Track:** React / TypeScript / asynchronous UI. **Level:** junior to intermediate. **Time:** 60 minutes.\nBuild a customer search for the same fictional SaaS. Use the supplied mock API; no server is needed. This practices the asynchronous state and business UI work relevant to your fullstack profile.\n## Acceptance criteria\n- [ ] Display a labelled search input and search automatically when it changes.\n- [ ] An empty query loads all customers; matching is case-insensitive by name or email.\n- [ ] Show loading, success, empty results, and error states.\n- [ ] Clear previous results when starting a new request.\n- [ ] A Retry button repeats the current query after an error.\n- [ ] An old response must never overwrite newer results or a newer error.\n- [ ] Avoid updates from requests whose effect has been cleaned up.\n- [ ] Use stable row keys and accessible status messages.\nCore: native React state and effects. Skip styling polish. Debouncing and a query library comparison are extensions.\n## Provided mock API\nSave this in api.ts. \"error\" always fails; retrying it should fail again. To test recovery, change the query.\n```typescript\nexport type Customer = { id: number; name: string; email: string };\nconst customers: Customer[] = [\n  { id: 1, name: \"Acme\", email: \"hello@acme.example\" },\n  { id: 2, name: \"Aster\", email: \"team@aster.example\" },\n  { id: 3, name: \"Boreal\", email: \"contact@boreal.example\" },\n];\nexport async function searchCustomers(query: string): Promise<Customer[]> {\n  const q = query.trim().toLowerCase();\n  await new Promise(resolve => setTimeout(resolve, q === \"a\" ? 900 : 150));\n  if (q === \"error\") throw new Error(\"Service unavailable\");\n  return customers.filter(c =>\n    c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)\n  );\n}\n```\n## Manual verification\n1. Open the app: see loading, then three customers.\n2. Search \"ACME\": see Acme. Search \"zzzz\": see an empty message.\n3. Search \"error\": see an error and a working Retry button.\n4. Type \"a\", then immediately \"ac\": wait a full second. Only Acme must remain. The slow \"a\" response must not replace it.\n5. Start \"a\", then immediately enter \"error\": the late success must not clear the current error.\n6. Clear the input: all customers return.\n<details>\n<summary>Hint — open only after trying</summary>\n\tAn effect cleanup can mark its request obsolete. Check that flag in both success and failure handlers. A retry counter can trigger the effect without changing the query.\n</details>\n<details>\n<summary>Reference solution — minimal component</summary>\n\t```typescript\nimport { useEffect, useState } from \"react\";\nimport { searchCustomers, type Customer } from \"./api\";\ntype State =\n  | { status: \"loading\" }\n  | { status: \"error\"; message: string }\n  | { status: \"success\"; customers: Customer[] };\n\nexport default function CustomerSearch() {\n  const [query, setQuery] = useState(\"\");\n  const [attempt, setAttempt] = useState(0);\n  const [state, setState] = useState<State>({ status: \"loading\" });\n  useEffect(() => {\n    let obsolete = false;\n    setState({ status: \"loading\" });\n    searchCustomers(query).then(\n      customers => {\n        if (!obsolete) setState({ status: \"success\", customers });\n      },\n      error => {\n        if (!obsolete) setState({\n          status: \"error\",\n          message: error instanceof Error ? error.message : \"Search failed\"\n        });\n      }\n    );\n    return () => { obsolete = true; };\n  }, [query, attempt]);\n\n  return (\n    <section>\n      <label htmlFor=\"customer-search\">Search customers</label>\n      <input id=\"customer-search\" value={query}\n        onChange={event => setQuery(event.target.value)} />\n      {state.status === \"loading\" && <p role=\"status\">Loading…</p>}\n      {state.status === \"error\" && (\n        <div>\n          <p role=\"alert\">{state.message}</p>\n          <button onClick={() => setAttempt(n => n + 1)}>Retry</button>\n        </div>\n      )}\n      {state.status === \"success\" && (\n        <>\n          <p role=\"status\">{state.customers.length} customers found</p>\n          <ul>{state.customers.map(customer => (\n            <li key={customer.id}>{customer.name} — {customer.email}</li>\n          ))}</ul>\n        </>\n      )}\n    </section>\n  );\n}\n\t```\n\tThis ignores obsolete results; it does not cancel the underlying mock request. With a real fetch API, discuss AbortController as well.\n</details>\n## Interview follow-ups and extensions\nWhy must failure handlers also ignore obsolete requests? Does debounce prevent response races? Add a 300 ms debounce, then repeat the race checks. How would a query library handle caching and request identity? Add an automated test with controllable promises.\n## Where to code\nUse VS Code. Create a personal folder called practical-interview-prep in your usual development directory and open that folder. Keep one subfolder per exercise: 01-invoice-validation, 02-customer-search, 03-sql-reporting.\nFor TypeScript, use a small TypeScript project with your usual runner and test setup. For React, use a React + TypeScript app and preview it in your browser. For SQL, write .sql files in VS Code and execute them against a local PostgreSQL practice database using your usual database client or psql. Editing SQL alone does not execute it.\nThe initial environment setup is outside the exercise timer. No deployment is needed. Notion stores your brief and progress; your local folder stores your code. They do not sync automatically.\n## Practice and review\nFirst attempt: documentation allowed; try before opening hints or solutions. Record any assistance. For a later interview simulation, agree the allowed tools before starting.\n- [ ] Read the brief and explain your approach aloud.\n- [ ] Implement the core requirements within the suggested time.\n- [ ] Check the supplied examples and add edge cases.\n- [ ] Explain one tradeoff and one improvement in two minutes.\n- [ ] Ask for a review using your code or repository link.\nUpdate Status and Last practised after an attempt; put the actual duration in Latest time (min). Mark Review needed when you want to revisit a gap. Use Link for your repository or relevant file link once one exists.\n## Attempt log\nDate:\nActual minutes:\nHelp used:\nWhat worked:\nWhat failed:\nWhat I would improve:\nCode/repository link:\nReview notes:\n"
  },
  {
    "id": "3efe8a375ff581878e02ff8aaed79df2",
    "title": "3Sum",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581878e02ff8aaed79df2",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Sorting",
      "Two pointers"
    ],
    "notes": "Sort, fix one value, find a pair, skip duplicates.",
    "content": "\n### What to practise\nSort, fix one value, find a pair, skip duplicates.\n### My next attempt\n- [ ] Explain the idea in my own words\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nthreeSum(nums) {\n        nums.sort((a, b) => a - b);\n        const res = [];\n\n        for (let i = 0; i < nums.length; i++) {\n            if (nums[i] > 0) break;\n            if (i > 0 && nums[i] === nums[i - 1]) continue;\n\n            let l = i + 1;\n            let r = nums.length - 1;\n            while (l < r) {\n                const sum = nums[i] + nums[l] + nums[r];\n                if (sum > 0) {\n                    r--;\n                } else if (sum < 0) {\n                    l++;\n                } else {\n                    res.push([nums[i], nums[l], nums[r]]);\n                    l++;\n                    r--;\n                    while (l < r && nums[l] === nums[l - 1]) {\n                        l++;\n                    }\n                }\n            }\n        }\n        return res;\n }\n```\n"
  },
  {
    "id": "3efe8a375ff581929843d2d77787fed7",
    "title": "Anagram",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581929843d2d77787fed7",
    "platform": "Exercism",
    "topics": [
      "Strings",
      "Sorting"
    ],
    "notes": "Normalize and compare letters; exclude the same word.",
    "content": "\n### What to practise\nNormalize and compare letters; exclude the same word.\n### Previous attempts\nCompleted in 13 min.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58138842efd8f6f06d963",
    "title": "Array.diff",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58138842efd8f6f06d963",
    "platform": "Codewars",
    "topics": [
      "Arrays",
      "Map/Set"
    ],
    "notes": "Remove values present in the second array.",
    "content": "\n### What to practise\nRemove values present in the second array.\n### Previous attempts\nCompleted with no problems reported; time not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581249f7dc2dd6b2f8601",
    "title": "ASCII Art",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581249f7dc2dd6b2f8601",
    "platform": "CodinGame",
    "topics": [
      "Strings",
      "Arrays"
    ],
    "notes": "Use string slices and indexes to build each output row.",
    "content": "\n### What to practise\nUse string slices and indexes to build each output row.\n### My next attempt\n- [ ] Solve in JavaScript.\n- [ ] Test an edge case and check output formatting.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5819d9685ea12a4381c63",
    "title": "Best Time to Buy and Sell Stock",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5819d9685ea12a4381c63",
    "platform": "NeetCode",
    "topics": [
      "Arrays"
    ],
    "notes": "Keep the lowest earlier price and best profit.",
    "content": "\n### What to practise\nKeep the lowest earlier price and best profit.\n### Previous attempts\nCompleted in 5 min 30 sec.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58178a16cfa7fee7395d9",
    "title": "Binary Search",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58178a16cfa7fee7395d9",
    "platform": "Exercism",
    "topics": [
      "Arrays",
      "Binary search"
    ],
    "notes": "Optional second version after NeetCode.",
    "content": "\n### What to practise\nOptional second version after NeetCode.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5819bb66fe79b454a44f9",
    "title": "Binary Search",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5819bb66fe79b454a44f9",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Binary search"
    ],
    "notes": "Use left/right bounds and discard half the sorted range.",
    "content": "\n### What to practise\nUse left/right bounds and discard half the sorted range.\n### Previous attempts\nEarlier attempt: 3 min using a Map. Later completion confirmed; method and duration not recorded. Review actual binary search; Map/indexOf does not practise the pattern.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n- [ ] Solve again without solution notes.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5818e8732c50a447efe52",
    "title": "Binary Tree Level Order Traversal",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5818e8732c50a447efe52",
    "platform": "NeetCode",
    "topics": [
      "BFS"
    ],
    "notes": "Use a queue to process one tree level at a time.",
    "content": "\n### What to practise\nUse a queue to process one tree level at a time.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5815b87ded668f3172099",
    "title": "Circular Buffer",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5815b87ded668f3172099",
    "platform": "Exercism",
    "topics": [
      "Arrays",
      "State"
    ],
    "notes": "Manage bounded storage and read/write positions.",
    "content": "\n### What to practise\nManage bounded storage and read/write positions.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5819e8746c29583209481",
    "title": "Climbing Stairs",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5819e8746c29583209481",
    "platform": "NeetCode",
    "topics": [
      "Dynamic programming"
    ],
    "notes": "Build the next answer from smaller answers.",
    "content": "\n### What to practise\nBuild the next answer from smaller answers.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5819490bfdfd35dc23aae",
    "title": "Coin Change",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5819490bfdfd35dc23aae",
    "platform": "NeetCode",
    "topics": [
      "Dynamic programming"
    ],
    "notes": "Find a minimum over alternative smaller amounts.",
    "content": "\n### What to practise\nFind a minimum over alternative smaller amounts.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58171a2f3f49404adff4a",
    "title": "Contains Duplicate",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58171a2f3f49404adff4a",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Map/Set"
    ],
    "notes": "Detect repeats with Set membership.",
    "content": "\n### What to practise\nDetect repeats with Set membership.\n### Previous attempts\nCompleted in under 1 minute; exact duration not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58105acbae8f088991848",
    "title": "Counting Duplicates",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58105acbae8f088991848",
    "platform": "Codewars",
    "topics": [
      "Strings",
      "Map/Set"
    ],
    "notes": "Count repeats after case normalization.",
    "content": "\n### What to practise\nCount repeats after case normalization.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nfunction duplicateCount(text){\n  const hash = {}\n  let count = 0;\n  \n  for (const c of text) {\n    let x = c.toLowerCase()\n    if (hash[x] === 1) count++\n    hash[x] = (hash[x] || 0) + 1\n  }\n  return count\n}\n```\n<empty-block/>\n"
  },
  {
    "id": "3efe8a375ff581cd9122e10819e810cf",
    "title": "Course Schedule",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581cd9122e10819e810cf",
    "platform": "NeetCode",
    "topics": [
      "Graphs",
      "DFS"
    ],
    "notes": "Detect cycles in directed dependencies.",
    "content": "\n### What to practise\nDetect cycles in directed dependencies.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581ac9eb3e809eba48f0a",
    "title": "Custom Set",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581ac9eb3e809eba48f0a",
    "platform": "Exercism",
    "topics": [
      "Map/Set"
    ],
    "notes": "Implement membership, union, intersection.",
    "content": "\n### What to practise\nImplement membership, union, intersection.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581ef83dbec8a168239ca",
    "title": "Daily Temperatures",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581ef83dbec8a168239ca",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Stack"
    ],
    "notes": "Keep unresolved indexes in a monotonic stack.",
    "content": "\n### What to practise\nKeep unresolved indexes in a monotonic stack.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581109bdfdaf6aca0de6e",
    "title": "Defibrillators",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581109bdfdaf6aca0de6e",
    "platform": "CodinGame",
    "topics": [
      "Strings",
      "Arrays"
    ],
    "notes": "Parse records and decimal numbers; calculate distances and keep the nearest result.",
    "content": "\n### What to practise\nParse records and decimal numbers; calculate distances and keep the nearest result.\n### My next attempt\n- [ ] Solve in JavaScript.\n- [ ] Test an edge case and check output formatting.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581b6a573f2c0fd49df18",
    "title": "Duplicate Encoder",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581b6a573f2c0fd49df18",
    "platform": "Codewars",
    "topics": [
      "Strings",
      "Map/Set"
    ],
    "notes": "Count characters, then transform the string.",
    "content": "\n### What to practise\nCount characters, then transform the string.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nfunction duplicateEncode(word){\n    const hash = {}\n    const lower = word.toLowerCase().split('')\n    \n    for (const c of lower) {\n      hash[c] = (hash[c] || 0) + 1\n    }\n  \n    return lower.map(e => hash[e] > 1 ? ')' : '(').join('')\n}\n```\n<empty-block/>\n"
  },
  {
    "id": "3efe8a375ff581789804faf772e1fefd",
    "title": "Equal Sides of an Array",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581789804faf772e1fefd",
    "platform": "Codewars",
    "topics": [
      "Arrays",
      "Prefix/suffix"
    ],
    "notes": "Find a balance point using left and right sums.",
    "content": "\n### What to practise\nFind a balance point using left and right sums.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nfunction findEvenIndex(arr) {\n    let rightSide = arr.reduce((acc, val) => acc + val, 0)\n    let leftSide = 0\n    \n    for (let i = 0; i < arr.length; i++) {\n      rightSide -= arr[i]\n      if (rightSide === leftSide) return i\n      leftSide += arr[i]\n    }\n    \n    return -1;\n}\n```\n"
  },
  {
    "id": "3efe8a375ff581db8d2ad6814145d5de",
    "title": "Find the Odd Int",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581db8d2ad6814145d5de",
    "platform": "Codewars",
    "topics": [
      "Arrays",
      "Map/Set"
    ],
    "notes": "Count occurrences and find the odd count.",
    "content": "\n### What to practise\nCount occurrences and find the odd count.\n### Previous attempts\nCompleted with no problems reported; time not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58149a0a4cb34946e652e",
    "title": "Grade School",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58149a0a4cb34946e652e",
    "platform": "Exercism",
    "topics": [
      "Map/Set",
      "Sorting"
    ],
    "notes": "Group students by grade and return sorted rosters.",
    "content": "\n### What to practise\nGroup students by grade and return sorted rosters.\n### Previous attempts\nCompleted; duration not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58100945ffc09bb356d28",
    "title": "Group Anagrams",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58100945ffc09bb356d28",
    "platform": "NeetCode",
    "topics": [
      "Strings",
      "Map/Set",
      "Sorting"
    ],
    "notes": "Group words by a shared normalized key.",
    "content": "\n### What to practise\nGroup words by a shared normalized key.\n### Previous attempts\nFirst attempt: about 15 min. Fast retry, but Map.values() versus Object.values(obj) was confusing. Latest completion confirmed with no duration. Reminder: \\[...map.values()\\] versus Object.values(obj).\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n- [ ] Solve again without solution notes.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nroupAnagrams(strs) {\n        const hash = new Map();\n\n        for (const c of strs) {\n            let sorted = c.split(\"\").sort().join(\"\");\n            if (hash.has(sorted)) {\n                hash.set(sorted, [...hash.get(sorted), c]);\n            } else {\n                hash.set(sorted, [c]);\n            }\n        }\n\n        return [...hash.values()]\n    }\n```\n"
  },
  {
    "id": "3efe8a375ff581a6a3d5c289c655f8be",
    "title": "Longest Consecutive Sequence",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581a6a3d5c289c655f8be",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Map/Set"
    ],
    "notes": "Start each sequence only when its predecessor is absent.",
    "content": "\n### What to practise\nStart each sequence only when its predecessor is absent.\n### Previous attempts\nStarted with nested loops, then learned the Set.has optimization. Completed; time not recorded. Review sequence starts and membership checks.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n- [ ] Solve again without solution notes.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nlongestConsecutive(nums) {\n        const hash = new Set(nums);\n        let total = 0;\n\n        for (const c of nums) {\n            let count = 1;\n            if (!hash.has(c - 1)) {\n                while (hash.has(c + count)) {\n                    count++;\n                }\n            }\n            total = Math.max(total, count)\n        }\n        return total\n    }\n```\n"
  },
  {
    "id": "3efe8a375ff5816f9e8be86717cfbad5",
    "title": "Longest Substring Without Repeating Characters",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5816f9e8be86717cfbad5",
    "platform": "NeetCode",
    "topics": [
      "Strings",
      "Sliding window",
      "Map/Set"
    ],
    "notes": "Maintain a duplicate-free window; move the left boundary correctly.",
    "content": "\n### What to practise\nMaintain a duplicate-free window; move the left boundary correctly.\n### Previous attempts\nInitial difficulty with sliding window. Retry completed in 19 min with some difficulty. Later completion confirmed; duration not recorded. Review without notes.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n- [ ] Solve again without solution notes.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nlengthOfLongestSubstring(s) {\n        const hash = new Set();\n        let total = 0;\n        let left = 0;\n\n        for (let right = 0; right < s.length; right++) {\n            if (hash.has(s[right])) {\n                while (hash.has(s[right])) {\n                    hash.delete(s[left++]);\n                }\n            }\n            hash.add(s[right]);\n\n            total = Math.max(total, hash.size);\n        }\n        return total;\n    }\n```\n"
  },
  {
    "id": "3efe8a375ff58102a9d2c344f09e2283",
    "title": "Luhn",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58102a9d2c344f09e2283",
    "platform": "Exercism",
    "topics": [
      "Strings",
      "Validation"
    ],
    "notes": "Validate input and process digits.",
    "content": "\n### What to practise\nValidate input and process digits.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58183a181c762d416a063",
    "title": "Matrix",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58183a181c762d416a063",
    "platform": "Exercism",
    "topics": [
      "Arrays"
    ],
    "notes": "Extract rows and columns using array indexes and map.",
    "content": "\n### What to practise\nExtract rows and columns using array indexes and map.\n### Previous attempts\nTook time to find the map approach, then figured it out. Completed; duration not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58129a844ca90dcb93652",
    "title": "Maximum Depth of Binary Tree",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58129a844ca90dcb93652",
    "platform": "NeetCode",
    "topics": [
      "Recursion",
      "DFS"
    ],
    "notes": "Handle an empty tree; combine the two child depths.",
    "content": "\n### What to practise\nHandle an empty tree; combine the two child depths.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nclass Solution {\n    /**\n     * @param {TreeNode} root\n     * @return {number}\n     */\n    dfs(node) {\n        if (!node) return 0\n        let leftCount = this.dfs(node.left)\n        let rightCount = this.dfs(node.right)\n\n        return Math.max(leftCount, rightCount) + 1\n    }\n\n    maxDepth(root) {\n        return this.dfs(root)\n    }\n}\n```\n<empty-block/>\n"
  },
  {
    "id": "3efe8a375ff581e89473c11811fad502",
    "title": "Merge Intervals",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581e89473c11811fad502",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Sorting"
    ],
    "notes": "Sort ranges and merge overlaps.",
    "content": "\n### What to practise\nSort ranges and merge overlaps.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5816191abe7c40c732497",
    "title": "Merge Two Sorted Lists",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5816191abe7c40c732497",
    "platform": "NeetCode",
    "topics": [
      "Linked lists",
      "Two pointers"
    ],
    "notes": "Choose the smaller node; advance only its list.",
    "content": "\n### What to practise\nChoose the smaller node; advance only its list.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581a6b85cca40eed1342a",
    "title": "MIME Type",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581a6b85cca40eed1342a",
    "platform": "CodinGame",
    "topics": [
      "Strings",
      "Map/Set"
    ],
    "notes": "Match file extensions to MIME types; practise Map lookups and case handling.",
    "content": "\n### What to practise\nMatch file extensions to MIME types; practise Map lookups and case handling.\n### My next attempt\n- [ ] Solve in JavaScript.\n- [ ] Test an edge case and check output formatting.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581d391a8ccc0d8ad52d4",
    "title": "Min Stack",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581d391a8ccc0d8ad52d4",
    "platform": "NeetCode",
    "topics": [
      "Stack",
      "State"
    ],
    "notes": "Track the current minimum through push and pop.",
    "content": "\n### What to practise\nTrack the current minimum through push and pop.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3f2e8a375ff58121b4f4cb2a92df8d52",
    "title": "NeetCode SQL — Aggregations",
    "sourceUrl": "https://app.notion.com/3f2e8a375ff58121b4f4cb2a92df8d52",
    "platform": "NeetCode",
    "topics": [
      "SQL"
    ],
    "notes": "SQL for Beginners • COUNT, SUM, GROUP BY and HAVING.",
    "content": ""
  },
  {
    "id": "3f2e8a375ff581deab13d8cf408d4405",
    "title": "NeetCode SQL — JOINs",
    "sourceUrl": "https://app.notion.com/3f2e8a375ff581deab13d8cf408d4405",
    "platform": "NeetCode",
    "topics": [
      "SQL"
    ],
    "notes": "SQL for Beginners • INNER/LEFT JOIN and combining related tables.",
    "content": ""
  },
  {
    "id": "3efe8a375ff5812bb29bc2007b4dcf6f",
    "title": "NeetCode SQL — SELECT & filtering",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5812bb29bc2007b4dcf6f",
    "platform": "NeetCode",
    "topics": [
      "SQL"
    ],
    "notes": "SQL for Beginners • SELECT, WHERE, sorting and basic conditions.",
    "content": "\n## NeetCode SQL practice\nUse NeetCode's SQL for Beginners track. Solve the exercise directly in NeetCode and record your attempt here.\nFocus: filtering rows with multiple conditions and writing a clean SELECT/WHERE query.\n"
  },
  {
    "id": "3f2e8a375ff5811d9838e0c3a03d6b25",
    "title": "NeetCode SQL — Subqueries & relational concepts",
    "sourceUrl": "https://app.notion.com/3f2e8a375ff5811d9838e0c3a03d6b25",
    "platform": "NeetCode",
    "topics": [
      "SQL"
    ],
    "notes": "SQL for Beginners • subqueries, relational modelling and query reasoning.",
    "content": ""
  },
  {
    "id": "3efe8a375ff581c0927cd988fc7c8227",
    "title": "Number of Islands",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581c0927cd988fc7c8227",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "DFS"
    ],
    "notes": "Explore a connected region and mark visited cells.",
    "content": "\n### What to practise\nExplore a connected region and mark visited cells.\n### Previous attempts\nCompleted after consulting DFS guidance. Revisit independently; time not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n- [ ] Solve again without solution notes.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nnumIslands(grid) {\n        let islands = 0;\n        const dfs = (x, y) => {\n            if (x < 0 || y < 0 || x >= grid.length || y >= grid[0].length || grid[x][y] === \"0\")\n                return;\n\n            grid[x][y] = \"0\";\n            dfs(x + 1, y);\n            dfs(x - 1, y);\n            dfs(x, y + 1);\n            dfs(x, y - 1);\n        };\n\n        for (let x = 0; x < grid.length; x++) {\n            for (let y = 0; y < grid[x].length; y++) {\n                if (grid[x][y] === \"1\") {\n                    islands++;\n                    dfs(x, y);\n                }\n            }\n        }\n        return islands;\n    }\n   \n```\n"
  },
  {
    "id": "3efe8a375ff58176987cc616c4e519a4",
    "title": "Product of Array Except Self",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58176987cc616c4e519a4",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Prefix/suffix"
    ],
    "notes": "Reuse products before and after each position.",
    "content": "\n### What to practise\nReuse products before and after each position.\n### Previous attempts\nStarted with nested loops, then understood prefix/suffix reuse. Completed; time not recorded. Rebuild the optimized solution without notes.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n- [ ] Solve again without solution notes.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nproductExceptSelf(nums) {\n        const prefix = []\n        const sufix = []\n\n        prefix[0] = 1\n        for (let i = 1; i < nums.length; i++) {\n            prefix[i] = nums[i - 1] * prefix[i - 1]\n        }\n        sufix[nums.length - 1] = 1\n        for (let i = nums.length - 2; i >= 0; i--) {\n            sufix[i] = nums[i + 1] * sufix[i + 1]\n        }\n        \n        return prefix.map((i, e) => i * sufix[e] )\n    }\n```\n"
  },
  {
    "id": "3efe8a375ff581228173e7bef71141fd",
    "title": "Reverse Linked List",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581228173e7bef71141fd",
    "platform": "NeetCode",
    "topics": [
      "Linked lists"
    ],
    "notes": "Save the next node before changing its link.",
    "content": "\n### What to practise\nSave the next node before changing its link.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5815b8486ff600fcdf9f4",
    "title": "Robot Simulator",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5815b8486ff600fcdf9f4",
    "platform": "Exercism",
    "topics": [
      "State"
    ],
    "notes": "Update direction and position with clear methods.",
    "content": "\n### What to practise\nUpdate direction and position with clear methods.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581408949e8f37e8d2445",
    "title": "Rotting Oranges",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581408949e8f37e8d2445",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "BFS"
    ],
    "notes": "Expand from all rotten oranges in layers.",
    "content": "\n### What to practise\nExpand from all rotten oranges in layers.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff5816e8604f5fb2269a69e",
    "title": "Run-Length Encoding",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5816e8604f5fb2269a69e",
    "platform": "Exercism",
    "topics": [
      "Strings"
    ],
    "notes": "Encode and decode runs of repeated characters.",
    "content": "\n### What to practise\nEncode and decode runs of repeated characters.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n```javascript\nexport const encode = (str) => {\n  let response = ''\n  let left = 0\n  for (let right = 0; right <= str.length; right++) {\n    if(str[right] !== str[left]) {\n      let nbr = right - left\n      response +=  (nbr > 1 ? nbr : \"\") + str[left]\n      left = right\n    }\n  }\n  return response\n};\n\nexport const decode = (str) => {\n  let response = ''\n  let number = 0;\n  for (let right = 0; right < str.length; right++) {\n    while (str[right] >= '0' && str[right] <= 9 && right < str.length) {\n      number = Number(str[right]) + (10 * number)\n      right++\n    }\n    if (!number) response += str[right]\n    else {\n      while (number) {\n        response += str[right]\n        number--\n      }\n    }\n  }\n  return response\n};\n```\n"
  },
  {
    "id": "3efe8a375ff5816f8508da0479fc12c3",
    "title": "Search in Rotated Sorted Array",
    "sourceUrl": "https://app.notion.com/3efe8a375ff5816f8508da0479fc12c3",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Binary search"
    ],
    "notes": "Identify the sorted half before choosing a range.",
    "content": "\n### What to practise\nIdentify the sorted half before choosing a range.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581448bc2e8f5b7402781",
    "title": "Subsets",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581448bc2e8f5b7402781",
    "platform": "NeetCode",
    "topics": [
      "Backtracking",
      "Recursion"
    ],
    "notes": "Explore choices; copy each result array.",
    "content": "\n### What to practise\nExplore choices; copy each result array.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581e796edc85dcbacf463",
    "title": "Top K Frequent Elements",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581e796edc85dcbacf463",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Map/Set"
    ],
    "notes": "Count items, then select the most frequent.",
    "content": "\n### What to practise\nCount items, then select the most frequent.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581778e64e58a919cac3b",
    "title": "Two Sum",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581778e64e58a919cac3b",
    "platform": "NeetCode",
    "topics": [
      "Arrays",
      "Map/Set"
    ],
    "notes": "Look up the missing partner while scanning.",
    "content": "\n### What to practise\nLook up the missing partner while scanning.\n### Previous attempts\nCompleted in 3 min 30 sec.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58118a783e68bc358c125",
    "title": "Valid Anagram",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58118a783e68bc358c125",
    "platform": "NeetCode",
    "topics": [
      "Strings",
      "Map/Set"
    ],
    "notes": "Compare character counts.",
    "content": "\n### What to practise\nCompare character counts.\n### Previous attempts\nCompleted in about 1 minute.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581e4b0fbf732a8b56d9a",
    "title": "Valid Braces",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581e4b0fbf732a8b56d9a",
    "platform": "Codewars",
    "topics": [
      "Strings",
      "Stack"
    ],
    "notes": "Match nested brackets with a stack.",
    "content": "\n### What to practise\nMatch nested brackets with a stack.\n### Previous attempts\nCompleted with no problems reported; time not recorded.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58120bbffc60182532d24",
    "title": "Valid Palindrome",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58120bbffc60182532d24",
    "platform": "NeetCode",
    "topics": [
      "Strings",
      "Two pointers"
    ],
    "notes": "Normalize characters and compare opposite ends.",
    "content": "\n### What to practise\nNormalize characters and compare opposite ends.\n### Previous attempts\nFirst attempt: 21 min. Retry: 5 min 48 sec.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58148b641ee68cf47a02c",
    "title": "Valid Parentheses",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58148b641ee68cf47a02c",
    "platform": "NeetCode",
    "topics": [
      "Strings",
      "Stack"
    ],
    "notes": "Match each closing bracket with the latest opening bracket.",
    "content": "\n### What to practise\nMatch each closing bracket with the latest opening bracket.\n### Previous attempts\nCompleted in about 8 min.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff58101a464f62a0ed96552",
    "title": "Validate Binary Search Tree",
    "sourceUrl": "https://app.notion.com/3efe8a375ff58101a464f62a0ed96552",
    "platform": "NeetCode",
    "topics": [
      "Recursion",
      "DFS"
    ],
    "notes": "Respect bounds from all ancestors.",
    "content": "\n### What to practise\nRespect bounds from all ancestors.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  },
  {
    "id": "3efe8a375ff581958136f8ac388ad2ab",
    "title": "Word Count",
    "sourceUrl": "https://app.notion.com/3efe8a375ff581958136f8ac388ad2ab",
    "platform": "Exercism",
    "topics": [
      "Strings",
      "Map/Set",
      "Regex"
    ],
    "notes": "Extract words, normalize case, count occurrences.",
    "content": "\n### What to practise\nExtract words, normalize case, count occurrences.\n### Previous attempts\nCompleted in about 40 min; looked up regex syntax. Syntax lookup recorded separately from algorithm help.\n### My next attempt\n- [ ] Explain the idea in my own words.\n- [ ] Test one edge case.\n### My solution\nAdd your JavaScript solution here.\n"
  }
] as const;
