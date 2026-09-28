// Port of CPython difflib.SequenceMatcher with isjunk=None: ratio() and what it depends on.
export class SequenceMatcher {
  constructor(a, b, { autojunk = true } = {}) {
    this.a = Array.from(a);
    this.b = Array.from(b);
    this.matchingBlocks = null;
    const b2j = new Map();
    this.b.forEach((elt, i) => {
      if (!b2j.has(elt)) b2j.set(elt, []);
      b2j.get(elt).push(i);
    });
    // Popular elements of long sequences are removed from b2j (they are not junk: extension still sees them).
    const n = this.b.length;
    if (autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, indices] of [...b2j]) if (indices.length > ntest) b2j.delete(elt);
    }
    this.b2j = b2j;
  }

  findLongestMatch(alo, ahi, blo, bhi) {
    const { a, b, b2j } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = newj2len;
    }
    // With isjunk=None the junk set is empty, so only the non-junk extension loops can run.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; bestsize++; }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  }

  getMatchingBlocks() {
    if (this.matchingBlocks) return this.matchingBlocks;
    const la = this.a.length;
    const lb = this.b.length;
    const queue = [[0, la, 0, lb]];
    const blocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const [i, j, k] = this.findLongestMatch(alo, ahi, blo, bhi);
      if (k) {
        blocks.push([i, j, k]);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    let [i1, j1, k1] = [0, 0, 0];
    const nonAdjacent = [];
    for (const [i2, j2, k2] of blocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
      else {
        if (k1) nonAdjacent.push([i1, j1, k1]);
        [i1, j1, k1] = [i2, j2, k2];
      }
    }
    if (k1) nonAdjacent.push([i1, j1, k1]);
    nonAdjacent.push([la, lb, 0]);
    this.matchingBlocks = nonAdjacent;
    return nonAdjacent;
  }

  ratio() {
    const matches = this.getMatchingBlocks().reduce((sum, block) => sum + block[2], 0);
    const length = this.a.length + this.b.length;
    return length ? (2.0 * matches) / length : 1.0;
  }
}
