/**
 * Effects must use a block body. A concise body returns its expression to React, which treats a
 * non-function return as a broken cleanup (v1: Chrome's scrollTo() started returning a Promise).
 */
export default {
  meta: {
    type: 'problem',
    messages: { concise: 'Use a block body `() => { ... }` for {{name}}: a concise body returns its value to React.' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const name =
          node.callee.type === 'Identifier'
            ? node.callee.name
            : node.callee.type === 'MemberExpression'
              ? node.callee.property.name
              : null;
        if (name !== 'useEffect' && name !== 'useLayoutEffect') return;
        const fn = node.arguments[0];
        if (fn && fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement') {
          context.report({ node: fn, messageId: 'concise', data: { name } });
        }
      },
    };
  },
};
