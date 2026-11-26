// Lightweight reading of Apex source for the review rules.
//
// This is not a full Apex parser. It does just enough to make pattern-based rules
// reliable: it blanks out comments and string literals (keeping every character's
// position, so line numbers stay correct) and works out which code sits inside a loop.
// Cases these patterns cannot see, such as a query in a helper method that is called
// from a loop, are left to Claude's review step.

export interface ApexSource {
  /** Original text, used for snippets and string literal checks. */
  raw: string;
  /** Same length as raw, with comments and string contents replaced by spaces. */
  code: string;
  /** Start offset of every line, for offset to line lookups. */
  lineStarts: number[];
  /** True for each offset that is inside a loop body. */
  inLoop: Uint8Array;
  /** String literals with their start offset (offset of the opening quote). */
  strings: { value: string; offset: number }[];
  isTest: boolean;
  isTrigger: boolean;
}

export function parseApex(raw: string, fileName = ""): ApexSource {
  const { code, strings } = blankCommentsAndStrings(raw);
  const lineStarts = [0];
  for (let i = 0; i < raw.length; i++) if (raw[i] === "\n") lineStarts.push(i + 1);
  return {
    raw,
    code,
    lineStarts,
    inLoop: markLoopBodies(code),
    strings,
    isTest: /@isTest\b/i.test(code),
    isTrigger: /\.trigger$/i.test(fileName) || /^\s*trigger\s+\w+\s+on\s+/im.test(code),
  };
}

export function lineOf(src: ApexSource, offset: number): number {
  let lo = 0;
  let hi = src.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (src.lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function lineText(src: ApexSource, line: number): string {
  const start = src.lineStarts[line - 1];
  const end = line < src.lineStarts.length ? src.lineStarts[line] - 1 : src.raw.length;
  return src.raw.slice(start, end).trim();
}

/** Replace comment text and string contents with spaces, keeping offsets and newlines. */
function blankCommentsAndStrings(raw: string) {
  const out = raw.split("");
  const strings: { value: string; offset: number }[] = [];
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < raw.length) {
    if (raw.startsWith("//", i)) {
      const end = raw.indexOf("\n", i);
      const stop = end === -1 ? raw.length : end;
      blank(i, stop);
      i = stop;
    } else if (raw.startsWith("/*", i)) {
      const end = raw.indexOf("*/", i + 2);
      const stop = end === -1 ? raw.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (raw[i] === "'") {
      // Apex strings use single quotes and backslash escapes.
      let j = i + 1;
      while (j < raw.length && raw[j] !== "'" && raw[j] !== "\n") j += raw[j] === "\\" ? 2 : 1;
      strings.push({ value: raw.slice(i + 1, j), offset: i });
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return { code: out.join(""), strings };
}

/**
 * Mark the body of every for, while and do loop. The loop header is not marked, so a
 * SOQL for loop such as `for (Account a : [SELECT ...])` is correctly treated as safe.
 */
function markLoopBodies(code: string): Uint8Array {
  const inLoop = new Uint8Array(code.length);
  const stack: boolean[] = []; // one entry per open brace: is it a loop body?
  let pendingLoop = false; // a loop header has ended and its body has not opened yet
  let i = 0;
  const loopDepth = () => stack.filter(Boolean).length;

  while (i < code.length) {
    const kw = /^(for|while)\s*\(/.exec(code.slice(i, i + 12));
    if (kw && isWordStart(code, i)) {
      // Skip to the matching closing parenthesis of the loop header.
      let j = code.indexOf("(", i);
      let depth = 0;
      for (; j < code.length; j++) {
        if (code[j] === "(") depth++;
        else if (code[j] === ")" && --depth === 0) break;
      }
      // `while (...);` closing a do loop has no body of its own.
      const after = code.slice(j + 1).match(/^\s*(.)/);
      if (after && after[1] !== ";") pendingLoop = true;
      if (loopDepth() > 0) for (let k = i; k <= j; k++) inLoop[k] = 1;
      i = j + 1;
      continue;
    }
    if (code.startsWith("do", i) && isWordStart(code, i) && /^do\s*\{/.test(code.slice(i, i + 10))) {
      pendingLoop = true;
      i += 2;
      continue;
    }
    const ch = code[i];
    if (ch === "{") {
      stack.push(pendingLoop);
      pendingLoop = false;
    } else if (ch === "}") {
      stack.pop();
    } else if (pendingLoop && !/\s/.test(ch)) {
      // Single statement loop body without braces: mark until the end of the statement.
      const end = code.indexOf(";", i);
      const stop = end === -1 ? code.length : end;
      for (let k = i; k <= stop; k++) inLoop[k] = 1;
      pendingLoop = false;
      i = stop + 1;
      continue;
    }
    if (loopDepth() > 0) inLoop[i] = 1;
    i++;
  }
  return inLoop;
}

function isWordStart(code: string, i: number) {
  return i === 0 || !/[\w.]/.test(code[i - 1]);
}
