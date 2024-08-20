import type { TSESTreeFunction } from "@eslint-react/ast";
import { isNodeEqual } from "@eslint-react/ast";
import type { ERSemanticEntry } from "@eslint-react/core";
import {
  isCleanupFunction,
  isComponentDidMountFunction,
  isComponentWillUnmountFunction,
  isSetupFunction,
  PHASE_RELEVANCE,
} from "@eslint-react/core";
import { F, O } from "@eslint-react/tools";
import { isNodeValueEqual } from "@eslint-react/var";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { isMatching, match, P } from "ts-pattern";

import { createRule } from "../utils";

// #region Rule Metadata

export const RULE_NAME = "no-leaked-timeout";

export type MessageID =
  | "noLeakedTimeoutInEffect"
  | "noLeakedTimeoutInLifecycle"
  | "noLeakedTimeoutNoTimeoutId";

// #endregion

// #region Types

/* eslint-disable perfectionist/sort-union-types */
type EventMethodKind = "setTimeout" | "clearTimeout";
type EffectMethodKind = "useEffect" | "useLayoutEffect";
type LifecycleMethodKind = "componentDidMount" | "componentWillUnmount";
type EffectFunctionKind = "setup" | "cleanup";
type LifecycleFunctionKind = "mount" | "unmount";
type FunctionKind = EffectFunctionKind | LifecycleFunctionKind | "other";
type CallKind = EventMethodKind | EffectMethodKind | LifecycleMethodKind | "other";
/* eslint-enable perfectionist/sort-union-types */

interface Entry extends ERSemanticEntry {
  node: TSESTree.CallExpression;
  callee: TSESTree.Node;
  timeoutID: TSESTree.Node;
}

// #endregion

// #region Helpers

function getCallKind(node: TSESTree.CallExpression): CallKind {
  switch (true) {
    case node.callee.type === AST_NODE_TYPES.Identifier
      && isMatching(P.union("setTimeout", "clearTimeout"), node.callee.name):
      return node.callee.name;
    case node.callee.type === AST_NODE_TYPES.MemberExpression
      && node.callee.property.type === AST_NODE_TYPES.Identifier
      && isMatching(P.union("setTimeout", "clearTimeout"), node.callee.property.name):
      return node.callee.property.name;
    default:
      return "other";
  }
}

function getFunctionKind(node: TSESTreeFunction) {
  return match<TSESTreeFunction, FunctionKind>(node)
    .when(isSetupFunction, () => "setup")
    .when(isCleanupFunction, () => "cleanup")
    .when(isComponentDidMountFunction, () => "mount")
    .when(isComponentWillUnmountFunction, () => "unmount")
    .otherwise(() => "other");
}

function getTimeoutID(node: TSESTree.Node, prev?: TSESTree.Node): O.Option<TSESTree.Node> {
  switch (true) {
    case node.type === AST_NODE_TYPES.VariableDeclarator
      && node.init === prev:
      return O.some(node.id);
    case node.type === AST_NODE_TYPES.AssignmentExpression
      && node.right === prev:
      return O.some(node.left);
    case node.type === AST_NODE_TYPES.BlockStatement
      || node.type === AST_NODE_TYPES.Program
      || node.parent === node:
      return O.none();
    default:
      return getTimeoutID(node.parent, node);
  }
}

// #endregion

// #region Rule Definition

export default createRule<[], MessageID>({
  meta: {
    type: "problem",
    docs: {
      description: "enforce that every 'setTimeout' in a component or custom hook has a corresponding 'clearTimeout'.",
    },
    messages: {
      noLeakedTimeoutInEffect: "'setTimeout' must be paired with 'clearTimeout' in {{kind}}",
      noLeakedTimeoutInLifecycle: "'setTimeout' must be paired with 'clearTimeout' in {{kind}}",
      noLeakedTimeoutNoTimeoutId: "'setTimeout' must have a timeout ID assigned to a variable",
    },
    schema: [],
  },
  name: RULE_NAME,
  create(context) {
    if (!context.sourceCode.text.includes("setTimeout")) return {};
    const fStack: [node: TSESTreeFunction, kind: FunctionKind][] = [];
    const sEntries: Entry[] = [];
    const rEntries: Entry[] = [];
    const isInverseEntry: {
      (a: Entry): (b: Entry) => boolean;
      (a: Entry, b: Entry): boolean;
    } = F.dual(2, (a: Entry, b: Entry) => {
      const aTimeoutID = a.timeoutID;
      const bTimeoutID = b.timeoutID;
      const aTimeoutIDScope = context.sourceCode.getScope(aTimeoutID);
      const bTimeoutIDScope = context.sourceCode.getScope(bTimeoutID);
      switch (true) {
        case aTimeoutID.type === AST_NODE_TYPES.Identifier
          && bTimeoutID.type === AST_NODE_TYPES.Identifier: {
          return isNodeValueEqual(aTimeoutID, bTimeoutID, [aTimeoutIDScope, bTimeoutIDScope]);
        }
        case aTimeoutID.type === AST_NODE_TYPES.AssignmentExpression
          && bTimeoutID.type === AST_NODE_TYPES.AssignmentExpression: {
          return isNodeEqual(aTimeoutID.left, bTimeoutID.left);
        }
        default:
          return isNodeValueEqual(aTimeoutID, bTimeoutID, [aTimeoutIDScope, bTimeoutIDScope]);
      }
    });
    return {
      [":function"](node: TSESTreeFunction) {
        const fKind = getFunctionKind(node);
        fStack.push([node, fKind]);
      },
      [":function:exit"]() {
        fStack.pop();
      },
      ["CallExpression"](node) {
        const callKind = getCallKind(node);
        switch (callKind) {
          case "setTimeout": {
            const [fNode, fKind] = fStack.at(-1) ?? [];
            if (!fNode || !fKind) break;
            if (!PHASE_RELEVANCE.has(fKind)) break;
            const timeoutIdNode = O.getOrNull(getTimeoutID(node));
            if (!timeoutIdNode) {
              context.report({
                messageId: "noLeakedTimeoutNoTimeoutId",
                node,
              });
              break;
            }
            sEntries.push({
              kind: callKind,
              node,
              callee: node.callee,
              phase: fKind,
              timeoutID: timeoutIdNode,
            });
            break;
          }
          case "clearTimeout": {
            const [fNode, fKind] = fStack.at(-1) ?? [];
            if (!fNode || !fKind) break;
            if (!PHASE_RELEVANCE.has(fKind)) break;
            const [timeoutIdNode] = node.arguments;
            if (!timeoutIdNode) break;
            rEntries.push({
              kind: callKind,
              node,
              callee: node.callee,
              phase: fKind,
              timeoutID: timeoutIdNode,
            });
            break;
          }
        }
      },
      ["Program:exit"]() {
        for (const sEntry of sEntries) {
          if (rEntries.some(isInverseEntry(sEntry))) continue;
          switch (sEntry.phase) {
            case "setup":
            case "cleanup":
              context.report({
                messageId: "noLeakedTimeoutInEffect",
                node: sEntry.node,
                data: {
                  kind: "useEffect",
                },
              });
              continue;
            case "mount":
            case "unmount":
              context.report({
                messageId: "noLeakedTimeoutInLifecycle",
                node: sEntry.node,
                data: {
                  kind: "componentDidMount",
                },
              });
              continue;
          }
        }
      },
    };
  },
  defaultOptions: [],
});

// #endregion
