// One fetched snapshot, shown as car-number order and lineup order side by side.
(() => {
  'use strict';
  const root = document.getElementById('rows');
  if (!root) return;
  const panelStatuses = new WeakMap();

  function addComparison(normal) {
    const panel = normal.closest('.odds-cell');
    const raceRow = panel?.parentElement;
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
    const groups = [...raceRow.querySelectorAll('.lineup .line-group')];
    const gap = 2, columnWidth = 28;
    const starts = new Set(groups.slice(1)
      .map(group => Number(group.querySelector('.car')?.textContent)));
    const columns = [...lineup.querySelectorAll('col')];
    order.forEach((number, index) => {
      const boundary = starts.has(number);
      columns[index + 1].style.width = (columnWidth + (boundary ? gap : 0)) + 'px';
      if (boundary) {
        heading.cells[index + 1].classList.add('exacta-line-start');
        for (const row of body.rows) row.cells[index + 1].classList.add('exacta-line-start');
      }
      if (boundary) rows.get(number).classList.add('exacta-line-row-start');
    });
    // Keep both sets of scores aligned beneath the two new quote rows.
    for (const table of [normal, lineup]) {
      for (const cell of [...table.tHead.rows[0].cells].slice(1, -1)) {
        cell.classList.add('exacta-pair-heading');
      }
    }
    const quotes = new Map([...normal.querySelectorAll('td[data-combination]')]
      .map(cell => [cell.dataset.combination, cell]));
    for (const group of groups) {
      const cars = [...group.querySelectorAll('.car')];
      for (let index = 0; index < cars.length - 1; index++) {
        // Riders competing for the same position do not define a simple line edge.
        if (cars[index].closest('.contest-pair') || cars[index + 1].closest('.contest-pair')) continue;
        const first = Number(cars[index].textContent), second = Number(cars[index + 1].textContent);
        const pair = document.createElement('span');
        pair.className = 'exacta-line-pair';
        pair.dataset.linePair = first + '-' + second;
        for (const combination of [first + '-' + second, second + '-' + first]) {
          const source = quotes.get(combination);
          if (!source) return;
          const value = document.createElement('span');
          value.className = source.className + ' exacta-pair-value';
          value.textContent = source.textContent;
          value.title = source.title;
          value.dataset.pairCombination = combination;
          pair.append(value);
        }
        headerByCar.get(first).append(pair);
      }
    }
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
    const baseWidth = 36 + order.length * 30;
    const lineupWidth = 36 + order.length * columnWidth + starts.size * gap;
    left.style.setProperty('--exacta-width', lineupWidth + 'px');
    panel.style.setProperty('--exacta-lineup-width', lineupWidth + 'px');
    const outer = root.closest('table');
    const requiredWidth = baseWidth + lineupWidth + 12 + 26;
    outer.style.setProperty('--odds-pair-width', Math.max(requiredWidth,
      Number.parseFloat(outer.style.getPropertyValue('--odds-pair-width')) || 0) + 'px');
    normal.replaceWith(pair);
    left.append(lineup);
    right.append(normal);
    const status = panelStatuses.get(panel);
    if (status) right.append(status);
    pair.append(left, right);
  }

  const update = () => {
    for (const panel of root.querySelectorAll('.odds-cell')) {
      const status = panelStatuses.get(panel) || panel.querySelector('.odds-status');
      if (!status) continue;
      panelStatuses.set(panel, status);
      // The shared reader clears content on refresh. Restore its original live
      // status node even after the old right-hand figure has been detached.
      if (!panel.querySelector('.odds-comparison') && panel.lastElementChild !== status) panel.append(status);
    }
    root.querySelectorAll('.odds-content > .exacta-matrix').forEach(addComparison);
  };
  update();
  new MutationObserver(update).observe(root, {childList: true, subtree: true});
})();
