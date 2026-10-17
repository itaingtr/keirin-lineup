// One fetched snapshot, shown as car-number order and lineup order side by side.
(() => {
  'use strict';
  const root = document.getElementById('rows');
  if (!root) return;

  function addComparison(normal) {
    const raceRow = normal.closest('.odds-cell')?.parentElement;
    if (!raceRow) return;
    const order = [...raceRow.querySelectorAll('.lineup .car')].map(car => Number(car.textContent));
    const lineup = normal.cloneNode(true);
    const heading = lineup.tHead?.rows[0], body = lineup.tBodies[0];
    if (!heading || !body || !order.length || new Set(order).size !== order.length) return;
    const headers = [...heading.cells];
    const numbers = headers.slice(1, -1).map(cell => Number(cell.querySelector('.exacta-number')?.textContent));
    if (numbers.length !== order.length || !order.every(number => numbers.includes(number))) return;
    const headerByCar = new Map(numbers.map((number, index) => [number, headers[index + 1]]));
    const rows = new Map(), cells = new Map();
    for (const row of body.rows) {
      const second = Number(row.cells[0].querySelector('.exacta-number')?.textContent);
      if (!order.includes(second) || rows.has(second) || row.cells.length !== order.length + 2) return;
      rows.set(second, row);
      cells.set(second, [...row.cells]);
    }
    if (rows.size !== order.length) return;
    heading.append(headers[0], ...order.map(number => headerByCar.get(number)), headers.at(-1));
    for (const second of order) {
      const original = cells.get(second);
      const byFirst = new Map(numbers.map((first, index) => [first, original[index + 1]]));
      rows.get(second).append(original[0], ...order.map(first => byFirst.get(first)), original.at(-1));
    }
    body.append(...order.map(number => rows.get(number)));
    normal.dataset.oddsOrder = 'number';
    lineup.dataset.oddsOrder = 'lineup';
    lineup.dataset.axisOrder = order.join('-');
    normal.caption.textContent = '車番順 · 列1着／行2着 · 得点／単勝想定';
    lineup.caption.textContent = 'ライン順 · 列1着／行2着 · 得点／単勝想定';
    normal.setAttribute('aria-label', '車番順の二車単オッズ');
    lineup.setAttribute('aria-label', 'ライン順の二車単オッズ');
    const pair = document.createElement('div');
    pair.className = 'odds-comparison';
    const left = document.createElement('figure'), right = document.createElement('figure');
    left.className = right.className = 'odds-comparison-view';
    normal.replaceWith(pair);
    left.append(normal);
    right.append(lineup);
    pair.append(left, right);
  }

  const update = () => root.querySelectorAll('.odds-content > .exacta-matrix').forEach(addComparison);
  update();
  new MutationObserver(update).observe(root, {childList: true, subtree: true});
})();
