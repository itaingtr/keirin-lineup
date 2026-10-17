(() => {
  'use strict';
  const root = document.getElementById('rows');
  if (!root) return;
  let configPromise;
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  async function endpoint(signal) {
    if (!configPromise) {
      configPromise = fetch('/keirin-lineup/odds-config.json', {cache: 'no-store', signal})
        .then(response => { if (!response.ok) throw new Error('config'); return response.json(); })
        .catch(error => { configPromise = null; throw error; });
    }
    const config = await configPromise;
    if (!config.endpoint) return null;
    const url = new URL(config.endpoint, location.href);
    if (url.protocol !== 'https:' && url.origin !== location.origin) throw new Error('endpoint');
    if (url.username || url.password) throw new Error('endpoint');
    return url;
  }
  function validate(data, raceKey, numbers) {
    if (data.race_key !== raceKey || data.bet_type !== 'exacta') throw new Error('race');
    if (!['open', 'closed', 'unavailable'].includes(data.status)) throw new Error('status');
    if (data.status !== 'open') return data;
    const observed = Date.parse(data.observed_at);
    if (!Number.isFinite(observed) || !/(?:Z|[+-]\d\d:\d\d)$/.test(data.observed_at) || observed > Date.now() + 60000) throw new Error('time');
    if (!Array.isArray(data.odds) || data.odds.length !== numbers.length * (numbers.length - 1)) throw new Error('incomplete');
    const seen = new Set();
    for (const item of data.odds) {
      if (!numbers.includes(item.first) || !numbers.includes(item.second) || item.first === item.second) throw new Error('pair');
      const key = item.first + '-' + item.second;
      if (seen.has(key)) throw new Error('duplicate');
      seen.add(key);
      if (item.value !== null && (typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value <= 0)) throw new Error('odds');
    }
    return data;
  }
  function matrix(data, numbers) {
    const values = new Map(data.odds.map(item => [item.first + '-' + item.second, item.value]));
    const table = element('table', 'exacta-matrix');
    table.append(element('caption', '', '二車単オッズ（行＝1着、列＝2着）'));
    const thead = element('thead');
    const heading = element('tr');
    heading.append(element('th', '', '1着＼2着'));
    for (const number of numbers) heading.append(element('th', '', number));
    for (const th of heading.children) th.scope = 'col';
    thead.append(heading);
    table.append(thead);
    const tbody = element('tbody');
    for (const first of numbers) {
      const row = element('tr');
      const th = element('th', '', first);
      th.scope = 'row';
      row.append(th);
      for (const second of numbers) {
        const value = values.get(first + '-' + second);
        row.append(element('td', '', first === second ? '—' : value === null ? '未発売・対象外' : value.toFixed(1)));
      }
      tbody.append(row);
    }
    table.append(tbody);
    return table;
  }
  function attach(row, index) {
    if (row.querySelector('.odds-toggle')) return;
    const link = row.querySelector('td.race .race-link');
    const lineup = row.querySelector('.lineup-cell');
    if (!link || !lineup) return;
    const raceKey = new URL(link.href).pathname;
    const numbers = [...new Set([...row.querySelectorAll('.car')].map(car => Number(car.textContent)))].sort((a,b) => a-b);
    const button = element('button', 'odds-toggle', '二車単オッズ');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    const panel = element('td', 'odds-cell');
    panel.id = 'exacta-panel-' + index;
    panel.hidden = true;
    button.setAttribute('aria-controls', panel.id);
    const heading = element('strong', 'odds-heading', '二車単オッズ');
    const refresh = element('button', 'odds-refresh', '更新');
    refresh.type = 'button';
    refresh.setAttribute('aria-label', '二車単オッズを更新');
    const status = element('p', 'odds-status');
    status.setAttribute('role', 'status');
    const content = element('div', 'odds-content');
    panel.append(heading, refresh, status, content);
    lineup.append(button);
    row.append(panel);
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      refresh.disabled = true;
      content.replaceChildren();
      status.textContent = '二車単オッズを確認中にゃ…';
      panel.setAttribute('aria-busy', 'true');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const url = await endpoint(controller.signal);
        if (!url) {
          status.textContent = 'オッズはまだ表示できないにゃ。取得先を確認中にゃ。';
          return;
        }
        url.searchParams.set('race_key', raceKey);
        url.searchParams.set('bet_type', 'exacta');
        const response = await fetch(url.href, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error('fetch');
        const data = validate(await response.json(), raceKey, numbers);
        if (data.status === 'closed') status.textContent = 'このレースのオッズ発売は終了しているにゃ。';
        else if (data.status === 'unavailable') status.textContent = 'このレースのオッズはまだ取得できないにゃ。';
        else {
          const formatted = new Intl.DateTimeFormat('ja-JP', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tokyo'}).format(new Date(data.observed_at));
          status.textContent = '取得時刻：' + formatted + '（オッズは変動するにゃ）';
          content.append(matrix(data, numbers));
        }
      } catch (error) {
        status.textContent = 'オッズを取得できなかったにゃ。「更新」で再確認してにゃ。';
      } finally {
        clearTimeout(timeout);
        loading = false;
        refresh.disabled = false;
        panel.removeAttribute('aria-busy');
      }
    }
    button.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      row.classList.toggle('odds-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'オッズを閉じる' : '二車単オッズ';
      if (open) load();
    });
    refresh.addEventListener('click', load);
  }
  const attachAll = () => [...root.children].forEach(attach);
  attachAll();
  new MutationObserver(attachAll).observe(root, {childList: true});
})();
