(function () {
  'use strict';

  // State
  let currentView = 'search';
  let currentCategory = '0';
  let searchResults = [];
  let focusedResultIndex = -1;
  let focusedDownloadIndex = -1;
  let searchTimeout = null;
  let pollInterval = null;

  // Elements
  const navBar = document.getElementById('navBar');
  const navTabs = navBar.querySelectorAll('.nav-tab');
  const searchView = document.getElementById('searchView');
  const downloadsView = document.getElementById('downloadsView');
  const categoryBar = document.getElementById('categoryBar');
  const catBtns = categoryBar.querySelectorAll('.cat-btn');
  const searchInput = document.getElementById('searchInput');
  const resultsStatus = document.getElementById('resultsStatus');
  const resultsList = document.getElementById('resultsList');
  const downloadsList = document.getElementById('downloadsList');
  const downloadsEmpty = document.getElementById('downloadsEmpty');

  // --- View switching ---

  function switchView(view) {
    currentView = view;
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));
    searchView.classList.toggle('active', view === 'search');
    downloadsView.classList.toggle('active', view === 'downloads');

    if (view === 'search') {
      searchInput.focus();
      stopPolling();
    } else {
      fetchDownloads();
      startPolling();
    }
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // --- Category toggle ---

  function setCategory(cat) {
    currentCategory = cat;
    catBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    if (searchInput.value.trim()) {
      doSearch();
    }
  }

  catBtns.forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.cat));
  });

  // --- Search ---

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (!q) {
      resultsList.innerHTML = '';
      resultsStatus.textContent = '';
      searchResults = [];
      focusedResultIndex = -1;
      return;
    }
    resultsStatus.textContent = 'Searching...';
    searchTimeout = setTimeout(doSearch, 400);
  });

  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;

    resultsStatus.textContent = 'Searching...';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&cat=${currentCategory}`);
      if (!res.ok) throw new Error('Search failed');
      searchResults = await res.json();
      renderResults();
    } catch (err) {
      resultsStatus.textContent = 'Search failed. Try again.';
      resultsList.innerHTML = '';
      searchResults = [];
    }
  }

  function renderResults() {
    focusedResultIndex = -1;

    if (searchResults.length === 0) {
      resultsStatus.textContent = 'No results found.';
      resultsList.innerHTML = '';
      return;
    }

    resultsStatus.textContent = `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`;

    resultsList.innerHTML = searchResults.map((r, i) => {
      const classes = ['result-row'];
      if (r.inLibrary) classes.push('in-library');

      const badges = [];

      // Resolution
      if (r.resolution) {
        const resClass = r.resolution === '2160p' ? 'badge-resolution-2160p' : 'badge-resolution-1080p';
        badges.push(`<span class="badge ${resClass}">${r.resolution}</span>`);
      }

      // Episode/Season
      if (r.type === 'episode' && r.episode) {
        badges.push(`<span class="badge badge-episode">${r.episode}</span>`);
      } else if (r.type === 'season' && r.episode) {
        badges.push(`<span class="badge badge-season">${r.episode}</span>`);
      }

      // In library
      if (r.inLibrary) {
        badges.push(`<span class="badge badge-library">In Jellyfin</span>`);
      }

      // Size
      badges.push(`<span class="badge badge-size">${r.size}</span>`);

      return `
        <li class="${classes.join(' ')}" tabindex="0" data-index="${i}">
          <div class="result-info">
            <div class="result-title">${escapeHtml(r.name)}</div>
            <div class="result-meta">${badges.join('')}</div>
          </div>
          <div class="result-seeders">${r.seeders} seeds</div>
        </li>
      `;
    }).join('');
  }

  // --- Downloads ---

  async function fetchDownloads() {
    try {
      const res = await fetch('/api/downloads');
      if (!res.ok) throw new Error('Failed to fetch');
      const downloads = await res.json();
      renderDownloads(downloads);
    } catch (err) {
      console.error('Failed to fetch downloads:', err);
    }
  }

  function renderDownloads(downloads) {
    downloadsEmpty.classList.toggle('visible', downloads.length === 0);

    if (downloads.length === 0) {
      downloadsList.innerHTML = '';
      return;
    }

    downloadsList.innerHTML = downloads.map((d, i) => {
      const isComplete = d.status === 'complete';
      const percent = isComplete ? 100 : (d.progress ? Math.round(d.progress.percentDone * 100) : 0);
      const speed = d.progress ? formatSpeed(d.progress.rateDownload) : '';
      const eta = d.progress && d.progress.eta > 0 ? formatEta(d.progress.eta) : '';

      const badges = [];
      if (d.resolution) {
        const resClass = d.resolution === '2160p' ? 'badge-resolution-2160p' : 'badge-resolution-1080p';
        badges.push(`<span class="badge ${resClass}">${d.resolution}</span>`);
      }
      if (d.type === 'episode' && d.episode) {
        badges.push(`<span class="badge badge-episode">${d.episode}</span>`);
      } else if (d.type === 'season' && d.episode) {
        badges.push(`<span class="badge badge-season">${d.episode}</span>`);
      }

      const statusClass = isComplete ? 'complete' : 'downloading';
      const statusText = isComplete ? 'Complete' : `${percent}%`;

      return `
        <li class="download-row" tabindex="0" data-index="${i}" data-id="${d.id}">
          <div class="download-info">
            <div class="download-title">${escapeHtml(d.name)}</div>
            <div class="download-meta">
              ${badges.join('')}
              ${speed ? `<span>${speed}</span>` : ''}
              ${eta ? `<span>ETA ${eta}</span>` : ''}
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar ${statusClass}" style="width: ${percent}%"></div>
            </div>
          </div>
          <div class="download-status ${statusClass}">${statusText}</div>
        </li>
      `;
    }).join('');
  }

  function startPolling() {
    stopPolling();
    pollInterval = setInterval(fetchDownloads, 3000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // --- Download action ---

  async function downloadResult(index) {
    const result = searchResults[index];
    if (!result || result.inLibrary) return;

    const row = resultsList.children[index];
    if (row.classList.contains('submitted')) return;

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: result.name,
          magnet: result.magnet,
          infoHash: result.infoHash,
          resolution: result.resolution,
          source: result.source,
          type: result.type,
          episode: result.episode,
          sizeBytes: result.sizeBytes,
        }),
      });

      if (!res.ok) throw new Error('Download failed');

      row.classList.add('submitted');
    } catch (err) {
      console.error('Download failed:', err);
    }
  }

  async function deleteDownload(id) {
    try {
      await fetch(`/api/downloads/${id}`, { method: 'DELETE' });
      fetchDownloads();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // --- Keyboard navigation ---

  document.addEventListener('keydown', (e) => {
    // Escape: clear search or go back to search view
    if (e.key === 'Escape') {
      e.preventDefault();
      if (currentView === 'downloads') {
        switchView('search');
      } else if (searchInput.value) {
        searchInput.value = '';
        resultsList.innerHTML = '';
        resultsStatus.textContent = '';
        searchResults = [];
        focusedResultIndex = -1;
        searchInput.focus();
      }
      return;
    }

    // If search input is focused, let typing work normally
    // except for arrow down which moves to results
    if (document.activeElement === searchInput) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        e.preventDefault();
        focusResult(0);
      }
      return;
    }

    // Nav bar tab navigation
    if (document.activeElement?.classList.contains('nav-tab')) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const view = e.key === 'ArrowLeft' ? 'search' : 'downloads';
        switchView(view);
        navBar.querySelector(`.nav-tab[data-view="${view}"]`).focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentView === 'search') {
          catBtns[0].focus();
        } else {
          const first = downloadsList.querySelector('.download-row');
          if (first) first.focus();
        }
        return;
      }
    }

    // Category bar navigation
    if (document.activeElement?.classList.contains('cat-btn')) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const btns = [...catBtns];
        const idx = btns.indexOf(document.activeElement);
        const next = e.key === 'ArrowLeft' ? Math.max(0, idx - 1) : Math.min(btns.length - 1, idx + 1);
        btns[next].focus();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        setCategory(document.activeElement.dataset.cat);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchInput.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navBar.querySelector('.nav-tab.active').focus();
        return;
      }
    }

    // Results navigation
    if (currentView === 'search' && document.activeElement?.classList.contains('result-row')) {
      const rows = [...resultsList.querySelectorAll('.result-row')];
      const idx = rows.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < rows.length - 1) rows[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) {
          rows[idx - 1].focus();
        } else {
          searchInput.focus();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const resultIndex = parseInt(document.activeElement.dataset.index);
        downloadResult(resultIndex);
      }
      return;
    }

    // Downloads navigation
    if (currentView === 'downloads' && document.activeElement?.classList.contains('download-row')) {
      const rows = [...downloadsList.querySelectorAll('.download-row')];
      const idx = rows.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < rows.length - 1) rows[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) {
          rows[idx - 1].focus();
        } else {
          navBar.querySelector('.nav-tab.active').focus();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const id = document.activeElement.dataset.id;
        if (id) deleteDownload(id);
      }
      return;
    }
  });

  function focusResult(index) {
    const rows = resultsList.querySelectorAll('.result-row');
    if (rows[index]) {
      focusedResultIndex = index;
      rows[index].focus();
    }
  }

  // Click handlers for results (mouse/touch)
  resultsList.addEventListener('click', (e) => {
    const row = e.target.closest('.result-row');
    if (!row) return;
    const index = parseInt(row.dataset.index);
    downloadResult(index);
  });

  // --- Helpers ---

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
    if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
    return bytesPerSec + ' B/s';
  }

  function formatEta(seconds) {
    if (seconds < 0) return '';
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  // --- Init ---
  searchInput.focus();
})();
