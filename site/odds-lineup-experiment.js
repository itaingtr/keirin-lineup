// Loaded only by the experimental page; the normal odds renderer stays unchanged.
(() => {
  'use strict';
  const root = document.getElementById('rows');
  if (!root) return;

  function reorder(table) {
    const raceRow = table.closest('.odds-cell')?.parentElement;
    if (!raceRow) return;
    const order = [...raceRow.querySelectorAll('.lineup .car')].map(car => Number(car.textContent));
    const key = order.join('-');
    if (table.dataset.axisOrder === key) return;
    const heading = table.tHead?.rows[0];
    const body = table.tBodies[0];
    if (!heading || !body || !order.length || new Set(order).size !== order.length) return;

    const headerCells = [...heading.cells];
    const numbers = headerCells.slice(1, -1).map(cell => Number(cell.querySelector('.exacta-number')?.textContent));
    if (numbers.length !== order.length || !order.every(number => numbers.includes(number))) return;
    const headers = new Map(numbers.map((number, index) => [number, headerCells[index + 1]]));
    const rows = new Map();
    const cells = new Map();
    for (const row of body.rows) {
      const second = Number(row.cells[0].querySelector('.exacta-number')?.textContent);
      if (!order.includes(second) || rows.has(second) || row.cells.length !== order.length + 2) return;
      rows.set(second, row);
      cells.set(second, [...row.cells]);
    }
    if (rows.size !== order.length) return;

    // Move existing nodes so prices, scores, names, minima and computed favorites
    // remain attached to their car numbers. The diagonal moves with its cell too.
    table.dataset.axisOrder = key;
    heading.append(headerCells[0], ...order.map(number => headers.get(number)), headerCells.at(-1));
    for (const second of order) {
      const original = cells.get(second);
      const byFirst = new Map(numbers.map((first, index) => [first, original[index + 1]]));
      rows.get(second).append(original[0], ...order.map(first => byFirst.get(first)), original.at(-1));
    }
    body.append(...order.map(number => rows.get(number)));
  }

  const update = () => root.querySelectorAll('.exacta-matrix').forEach(reorder);
  update();
  new MutationObserver(update).observe(root, {childList: true, subtree: true});
})();
