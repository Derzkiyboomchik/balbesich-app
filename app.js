// Telegram WebApp Attendance App
(function () {
  let appData = null;
  let activeSubject = 'all';
  let currentUserId = null;

  // 1. Инициализация Telegram WebApp
  function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      document.body.classList.add('telegram-mode');

      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUserId = tg.initDataUnsafe.user.id;
      }
    }

    // Для тестирования в браузере через ?user_id=1395978313
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('user_id')) {
      currentUserId = parseInt(urlParams.get('user_id'), 10);
    }
  }

  // 2. Получение безопасного URL данных из приватного хэша Telegram (#d=...)
  function resolveDataUrl() {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const urlParams = new URLSearchParams(window.location.search);

    const dataToken = hashParams.get('d') || urlParams.get('d');

    // Локальная разработка (localhost / 127.0.0.1)
    if (!dataToken && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'data/attendance.json';
    }

    if (!dataToken) {
      return null;
    }

    return `https://gist.githubusercontent.com/Derzkiyboomchik/${dataToken}/raw/attendance.json`;
  }

  // 3. Загрузка данных посещаемости
  async function loadData() {
    const dataUrl = resolveDataUrl();

    if (!dataUrl) {
      document.getElementById('app-body').innerHTML = `
        <div class="state-box">
          <div style="font-size: 36px; margin-bottom: 12px;">🔒</div>
          <p style="color: var(--text-main); font-weight: 600; font-size: 16px; margin: 0;">Доступ закрыт</p>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 8px; max-width: 280px; line-height: 1.4;">
            Пожалуйста, откройте актуальную таблицу через Telegram-бота вашей группы.
          </p>
        </div>
      `;
      return;
    }

    try {
      const resp = await fetch(dataUrl + '?v=' + Date.now());
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      appData = await resp.json();
      renderApp();
    } catch (err) {
      console.error('Failed to load attendance data:', err);
      document.getElementById('app-body').innerHTML = `
        <div class="state-box">
          <p style="color: #f87171; font-weight: 600;">Ошибка загрузки данных</p>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            Не удалось получить файл таблицы. Попробуйте обновить страницу.
          </p>
        </div>
      `;
    }
  }

  // 4. Рендер приложения
  function renderApp() {
    if (!appData) return;

    // Шапка: группа и время обновления
    document.getElementById('group-title-text').textContent = appData.group_name || 'Группа';
    if (appData.updated_at) {
      const date = new Date(appData.updated_at);
      const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      document.getElementById('update-time-text').textContent = `Обновлено: ${dateStr} ${timeStr}`;
    }

    // Табы предметов
    renderSubjectTabs();

    // Таблица
    renderTable();
  }

  // 5. Отрисовка табов
  function renderSubjectTabs() {
    const tabsContainer = document.getElementById('subject-tabs');
    tabsContainer.innerHTML = '';

    const subjects = appData.subjects || [{ id: 'all', name: 'Сводная' }];

    subjects.forEach((subj) => {
      const btn = document.createElement('button');
      btn.className = `tab-btn ${activeSubject === subj.id ? 'active' : ''}`;
      btn.textContent = subj.name;
      btn.onclick = () => {
        if (activeSubject !== subj.id) {
          activeSubject = subj.id;
          renderSubjectTabs();
          renderTable();
        }
      };
      tabsContainer.appendChild(btn);
    });
  }

  // 6. Отрисовка таблицы
  function renderTable() {
    const tableContainer = document.getElementById('table-container');

    let filteredLessons = appData.lessons || [];
    if (activeSubject !== 'all') {
      filteredLessons = filteredLessons.filter((l) => l.subject_id === activeSubject);
    }

    if (filteredLessons.length === 0) {
      tableContainer.innerHTML = `
        <div class="state-box">
          <p style="color: var(--text-muted);">Нет занятий по выбранной дисциплине</p>
        </div>
      `;
      return;
    }

    let theadHtml = `
      <thead>
        <tr>
          <th class="sticky-col">Студент</th>
    `;

    filteredLessons.forEach((lesson) => {
      const pairText = lesson.pair_number ? `${lesson.pair_number} пара` : '';
      const subjTag = activeSubject === 'all' && lesson.subject_id ? `<span class="subj-tag">${lesson.subject_id}</span>` : '';
      theadHtml += `
        <th>
          <div class="date-cell-header">
            <div class="date-day">${lesson.date || ''}</div>
            <div class="pair-num">${pairText}</div>
            ${subjTag}
          </div>
        </th>
      `;
    });

    theadHtml += `
          <th class="col-stat" title="Всего пропущено часов">Проп.</th>
          <th class="col-stat" title="Уважительная причина">УП</th>
          <th class="col-stat" title="Процент посещаемости">%</th>
        </tr>
      </thead>
    `;

    let tbodyHtml = '<tbody>';
    const students = appData.students || [];
    const records = appData.records || {};

    students.forEach((student) => {
      const isCurrent = currentUserId && student.telegram_id === currentUserId;
      tbodyHtml += `<tr class="${isCurrent ? 'is-current-user' : ''}">`;
      tbodyHtml += `<td class="sticky-col" title="${student.short_fio}">${student.short_fio}</td>`;

      let studentMissed = 0;
      let studentExcused = 0;

      filteredLessons.forEach((lesson) => {
        const key = `${student.id}_${lesson.id}`;
        const mark = records[key] || '';
        let badgeHtml = '';

        if (mark) {
          const lower = mark.toString().toLowerCase();
          let badgeClass = 'badge-2';
          if (lower === '4') badgeClass = 'badge-4';
          else if (lower === 'уп' || lower === 'б') badgeClass = 'badge-уп';

          badgeHtml = `<span class="badge-mark ${badgeClass}">${mark}</span>`;

          if (mark === '2') studentMissed += 2;
          else if (mark === '4') studentMissed += 4;
          else if (lower === 'уп' || lower === 'б') studentExcused += 2;
        }

        tbodyHtml += `<td>${badgeHtml}</td>`;
      });

      const totalLessonsCount = filteredLessons.length;
      const totalPossibleHours = totalLessonsCount * 2;
      let calculatedPercent = 100;
      if (totalPossibleHours > 0) {
        calculatedPercent = Math.max(0, Math.round(((totalPossibleHours - studentMissed) / totalPossibleHours) * 100));
      }

      const statClass = calculatedPercent < 80 ? 'stat-danger' : 'stat-ok';

      tbodyHtml += `
        <td class="col-stat ${studentMissed > 0 ? 'stat-danger' : ''}">${studentMissed > 0 ? studentMissed + 'ч' : '0'}</td>
        <td class="col-stat">${studentExcused > 0 ? studentExcused + 'ч' : '0'}</td>
        <td class="col-stat ${statClass}">${calculatedPercent}%</td>
      </tr>`;
    });

    tbodyHtml += '</tbody>';

    tableContainer.innerHTML = `
      <table class="attendance-grid">
        ${theadHtml}
        ${tbodyHtml}
      </table>
    `;

    setTimeout(() => {
      const wrapper = document.querySelector('.table-wrapper');
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    }, 50);
  }

  window.addEventListener('DOMContentLoaded', () => {
    initTelegram();
    loadData();
  });
})();
