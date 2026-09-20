import { describe, expect, it } from "vitest"

import {
  booleanLiteral,
  callExpression,
  conditionalExpression,
  identifier,
  indexExpression,
  isExpression,
  mapLiteral,
  memberExpression,
  stringLiteral,
} from "./factories"
import { parseExpressionFromSource, parseRules } from "./parser"
import { printNode, printRules } from "./printer"

describe("ast printer", () => {
  it("prints comments and declarations", () => {
    const source = `// top
rules_version = '2';
service cloud.firestore {
  // docs
  match /databases/{database}/documents {
    // read access
    allow read, write: if request.auth != null;
  }
}
`

    const tree = parseRules(source)
    const printed = printRules(tree)

    expect(printed).toMatchInlineSnapshot(`
      "// top
      rules_version = '2';
      service cloud.firestore {
        // docs
        match /databases/{database}/documents {
          // read access
          allow read, write: if request.auth != null;
        }
      }
      "
    `)
  })

  it("round-trips parse and print for comment nodes", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  // one
  let ok = true;
  // two
  return ok;
}
`

    const parsed = parseRules(source)
    const printed = printRules(parsed)
    const reparsed = parseRules(printed)

    expect(reparsed.service.body.statements.filter((node) => node.kind === "Comment")).toHaveLength(
      2,
    )
  })

  it("prints parentheses only when required by precedence", () => {
    const andExpr = parseExpressionFromSource("(a || b) && c")
    const orExpr = parseExpressionFromSource("a || (b && c)")

    expect(printNode(andExpr)).toBe("(a || b) && c")
    expect(printNode(orExpr)).toBe("a || b && c")
  })

  it("parenthesizes a lower-precedence child under is/call/member/index (regression)", () => {
    // A `ConditionalExpression` is the lowest-precedence expression kind. Used as the
    // receiver of `.foo()` / `[k]` / `is <type>` / as a call callee, it must be wrapped
    // — otherwise the postfix binds only to the ternary's alternate branch and silently
    // changes the printed rule's semantics. Regression for a precedence-table lookup
    // that used the wrong casing (`ExpressionPrecedence.isExpression` etc. against a
    // PascalCase-keyed table) and always fell through to the `minPrecedence = 0`
    // default, so nothing under these four node kinds was ever parenthesized.
    const cond = conditionalExpression(booleanLiteral(true), stringLiteral("yes"), mapLiteral([]))

    expect(printNode(isExpression(cond, "map"))).toBe("(true ? 'yes' : {}) is map")
    expect(printNode(memberExpression(cond, identifier("foo")))).toBe("(true ? 'yes' : {}).foo")
    expect(printNode(indexExpression(cond, stringLiteral("k")))).toBe("(true ? 'yes' : {})['k']")
    expect(printNode(callExpression(cond, []))).toBe("(true ? 'yes' : {})()")

    // Round-trips: printing then re-parsing must not lose the grouping.
    for (const source of ["(a ? b : c).foo()", "(a ? b : c)['k']", "(a ? b : c) is map"]) {
      expect(printNode(parseExpressionFromSource(source))).toBe(source)
    }
  })

  it("respects custom indentation unit", () => {
    const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    allow read: if true;
  }
}
`

    const printed = printRules(parseRules(source), { indent: "    " })
    expect(printed).toMatchInlineSnapshot(`
      "rules_version = '2';
      service cloud.firestore {
          match /databases/{database}/documents {
              allow read: if true;
          }
      }
      "
    `)
  })
})
