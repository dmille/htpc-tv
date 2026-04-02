(function () {
  'use strict';

  // State
  let currentView = 'search';
  let currentCategory = '0';
  let searchResults = [];
  let searchTimeout = null;
  let pollInterval = null;

  // Discover state
  let discoverData = [];
  let discoverFocusRow = 0;
  let discoverFocusCol = 0;
  let discoverScrollOffsets = []; // track scroll position per row
  let detailPanelOpen = false;
  let detailItem = null;
  let detailTorrent = null;

  // Elements
  const navBar = document.getElementById('navBar');
  const navTabs = navBar.querySelectorAll('.nav-tab');
  const searchView = document.getElementById('searchView');
  const downloadsView = document.getElementById('downloadsView');
  const discoverView = document.getElementById('discoverView');
  const categoryBar = document.getElementById('categoryBar');
  const catBtns = categoryBar.querySelectorAll('.cat-btn');
  const searchInput = document.getElementById('searchInput');
  const resultsStatus = document.getElementById('resultsStatus');
  const resultsList = document.getElementById('resultsList');
  const downloadsList = document.getElementById('downloadsList');
  const downloadsEmpty = document.getElementById('downloadsEmpty');
  const discoverRows = document.getElementById('discoverRows');
  const discoverLoading = document.getElementById('discoverLoading');
  const discoverBackdrop = document.getElementById('discoverBackdrop');
  const detailPanel = document.getElementById('detailPanel');
  const detailBackdrop = document.getElementById('detailBackdrop');
  const detailPoster = document.getElementById('detailPoster');
  const detailTitle = document.getElementById('detailTitle');
  const detailMeta = document.getElementById('detailMeta');
  const detailRatings = document.getElementById('detailRatings');
  const detailOverview = document.getElementById('detailOverview');
  const detailTorrentEl = document.getElementById('detailTorrent');
  const detailDownloadBtn = document.getElementById('detailDownloadBtn');
  const detailUnavailable = document.getElementById('detailUnavailable');

  // --- View switching ---

  function switchView(view) {
    currentView = view;
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));
    searchView.classList.toggle('active', view === 'search');
    downloadsView.classList.toggle('active', view === 'downloads');
    discoverView.classList.toggle('active', view === 'discover');

    stopPolling();
    if (view === 'search') {
      searchInput.focus();
      discoverBackdrop.classList.remove('visible');
    } else if (view === 'downloads') {
      fetchDownloads();
      startPolling();
      discoverBackdrop.classList.remove('visible');
    } else if (view === 'discover') {
      loadDiscover();
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

      if (r.resolution) {
        const resClass = r.resolution === '2160p' ? 'badge-resolution-2160p' : 'badge-resolution-1080p';
        badges.push(`<span class="badge ${resClass}">${r.resolution}</span>`);
      }

      if (r.type === 'episode' && r.episode) {
        badges.push(`<span class="badge badge-episode">${r.episode}</span>`);
      } else if (r.type === 'season' && r.episode) {
        badges.push(`<span class="badge badge-season">${r.episode}</span>`);
      }

      if (r.inLibrary) {
        badges.push(`<span class="badge badge-library">In Jellyfin</span>`);
      }

      badges.push(`<span class="badge badge-size">${r.size}</span>`);

      const posterHtml = r.poster
        ? `<img class="result-poster" src="${r.poster}" alt="" loading="lazy">`
        : `<div class="result-poster result-poster-empty"></div>`;

      return `
        <li class="${classes.join(' ')}" tabindex="0" data-index="${i}">
          ${posterHtml}
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

  // --- Download action (search view) ---

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

  // Click handlers for results
  resultsList.addEventListener('click', (e) => {
    const row = e.target.closest('.result-row');
    if (!row) return;
    downloadResult(parseInt(row.dataset.index));
  });

  // ===== DISCOVER =====

  async function loadDiscover() {
    discoverLoading.classList.add('visible');
    discoverRows.innerHTML = '';

    try {
      const res = await fetch('/api/discover');
      if (!res.ok) throw new Error('Failed');
      discoverData = await res.json();
      renderDiscover();
    } catch (err) {
      console.error('Discover load failed:', err);
      discoverLoading.classList.remove('visible');
    }
  }

  function renderDiscover() {
    discoverLoading.classList.remove('visible');

    if (discoverData.length === 0) {
      discoverRows.innerHTML = '<div class="empty-state visible">Discover is loading...</div>';
      return;
    }

    discoverScrollOffsets = discoverData.map(() => 0);

    discoverRows.innerHTML = discoverData.map((row, rowIdx) => {
      const postersHtml = row.items.map((item, colIdx) => {
        const poster = item.poster || '';
        return `
          <div class="poster-card" tabindex="0" data-row="${rowIdx}" data-col="${colIdx}">
            <img src="${poster}" alt="${escapeHtml(item.title)}" loading="lazy">
            <div class="poster-card-title">${escapeHtml(item.title)}</div>
            <div class="poster-card-year">${item.year || ''}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="discover-row" data-row="${rowIdx}">
          <div class="discover-row-title">${escapeHtml(row.title)}</div>
          <div class="discover-row-track">${postersHtml}</div>
        </div>
      `;
    }).join('');

    // On TV, focus first poster. On mobile, don't auto-focus (let user touch-scroll)
    discoverFocusRow = 0;
    discoverFocusCol = 0;
    if (!isMobile) {
      focusDiscoverPoster(0, 0);
    }
  }

  function focusDiscoverPoster(row, col) {
    const card = discoverRows.querySelector(`.poster-card[data-row="${row}"][data-col="${col}"]`);
    if (card) {
      card.focus();
      discoverFocusRow = row;
      discoverFocusCol = col;
      updateBackdrop(row, col);
      scrollRowToFocus(row, col);
    }
  }

  function updateBackdrop(row, col) {
    const rowData = discoverData[row];
    if (!rowData) return;
    const item = rowData.items[col];
    if (!item || !item.backdrop) {
      discoverBackdrop.classList.remove('visible');
      return;
    }
    discoverBackdrop.style.backgroundImage = `url(${item.backdrop})`;
    discoverBackdrop.classList.add('visible');
  }

  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  function scrollRowToFocus(rowIdx, colIdx) {
    const track = discoverRows.querySelector(`.discover-row[data-row="${rowIdx}"] .discover-row-track`);
    if (!track) return;

    if (isMobile) {
      // On mobile, use native scroll instead of transform
      const card = track.children[colIdx];
      if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } else {
      // On TV, use transform-based scroll
      const posterWidth = 8.8 * 16;
      const offset = Math.max(0, (colIdx - 1) * posterWidth);
      track.style.transform = `translateX(-${offset}px)`;
    }
    discoverScrollOffsets[rowIdx] = colIdx;
  }

  function getDiscoverRowLength(rowIdx) {
    return discoverData[rowIdx] ? discoverData[rowIdx].items.length : 0;
  }

  // --- Discover: poster focus handler ---

  discoverRows.addEventListener('focusin', (e) => {
    const card = e.target.closest('.poster-card');
    if (!card) return;
    const row = parseInt(card.dataset.row);
    const col = parseInt(card.dataset.col);
    discoverFocusRow = row;
    discoverFocusCol = col;
    updateBackdrop(row, col);
    scrollRowToFocus(row, col);
  });

  // Click on poster
  discoverRows.addEventListener('click', (e) => {
    const card = e.target.closest('.poster-card');
    if (!card) return;
    const row = parseInt(card.dataset.row);
    const col = parseInt(card.dataset.col);
    openDetailPanel(row, col);
  });

  // --- Detail Panel ---

  async function openDetailPanel(row, col) {
    const rowData = discoverData[row];
    if (!rowData) return;
    detailItem = rowData.items[col];
    if (!detailItem) return;

    detailPanelOpen = true;
    detailTorrent = null;

    // Set content
    detailPoster.src = detailItem.poster || '';
    detailTitle.textContent = detailItem.title;
    detailMeta.textContent = [detailItem.year, detailItem.mediaType === 'tv' ? 'TV Series' : 'Movie'].filter(Boolean).join(' \u2022 ');
    detailOverview.textContent = detailItem.overview || '';

    // Ratings
    const pills = [];
    const ratings = detailItem.ratings || {};
    if (ratings.rt) {
      const freshClass = ratings.rt >= 75 ? 'fresh' : '';
      pills.push(`<span class="rating-pill rating-pill-rt ${freshClass}">${ratings.rt}%</span>`);
    }
    if (ratings.imdb) {
      pills.push(`<span class="rating-pill rating-pill-imdb">${ratings.imdb}</span>`);
    }
    if (detailItem.tmdbRating) {
      pills.push(`<span class="rating-pill rating-pill-tmdb">${detailItem.tmdbRating.toFixed(1)}</span>`);
    }
    detailRatings.innerHTML = pills.join('');

    // Backdrop
    if (detailItem.backdrop) {
      detailBackdrop.style.backgroundImage = `url(${detailItem.backdrop})`;
    }

    // Reset torrent section
    detailTorrentEl.innerHTML = '<div class="detail-torrent-loading">Searching for best torrent...</div>';
    detailDownloadBtn.classList.add('hidden');
    detailDownloadBtn.classList.remove('downloading', 'success');
    detailDownloadBtn.textContent = 'Download';
    detailUnavailable.classList.add('hidden');

    // Show panel
    detailPanel.classList.remove('hidden', 'closing');
    setTimeout(() => detailDownloadBtn.focus(), 300);

    // Search for torrent
    try {
      const res = await fetch(`/api/discover/item/${detailItem.tmdbId}?type=${detailItem.mediaType}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      if (data.available && data.torrent) {
        detailTorrent = data.torrent;
        detailTorrentEl.innerHTML = `
          <div class="detail-torrent-info">
            <span class="badge badge-resolution-1080p">${data.torrent.resolution || '1080p'}</span>
            <span class="badge badge-size">${data.torrent.size}</span>
            <span style="color: var(--text-muted)">${data.torrent.seeders} seeds</span>
          </div>
        `;
        detailDownloadBtn.classList.remove('hidden');
        detailDownloadBtn.focus();
      } else {
        detailTorrentEl.innerHTML = '';
        detailUnavailable.classList.remove('hidden');
      }
    } catch (err) {
      detailTorrentEl.innerHTML = '';
      detailUnavailable.classList.remove('hidden');
    }
  }

  function closeDetailPanel() {
    detailPanelOpen = false;
    detailPanel.classList.add('closing');
    setTimeout(() => {
      detailPanel.classList.add('hidden');
      detailPanel.classList.remove('closing');
    }, 250);
    // Re-focus the poster we came from
    focusDiscoverPoster(discoverFocusRow, discoverFocusCol);
  }

  async function downloadFromDetail() {
    if (!detailTorrent || !detailItem) return;

    detailDownloadBtn.textContent = 'Downloading...';
    detailDownloadBtn.classList.add('downloading');

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: detailItem.title + (detailItem.year ? ` ${detailItem.year}` : ''),
          magnet: detailTorrent.magnet,
          infoHash: detailTorrent.infoHash,
          resolution: detailTorrent.resolution,
          source: detailTorrent.source,
          type: detailTorrent.type,
          episode: detailTorrent.episode,
          sizeBytes: detailTorrent.sizeBytes,
        }),
      });

      if (!res.ok) throw new Error('Download failed');

      detailDownloadBtn.textContent = 'Added';
      detailDownloadBtn.classList.remove('downloading');
      detailDownloadBtn.classList.add('success');

      // Mark poster as downloaded
      const card = discoverRows.querySelector(`.poster-card[data-row="${discoverFocusRow}"][data-col="${discoverFocusCol}"]`);
      if (card) card.classList.add('downloaded');

      // Auto-dismiss after 2s
      setTimeout(closeDetailPanel, 2000);
    } catch (err) {
      detailDownloadBtn.textContent = 'Failed - Try Again';
      detailDownloadBtn.classList.remove('downloading');
    }
  }

  detailDownloadBtn.addEventListener('click', downloadFromDetail);

  // ===== KEYBOARD NAVIGATION =====

  document.addEventListener('keydown', (e) => {
    // Detail panel takes priority
    if (detailPanelOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDetailPanel();
      } else if (e.key === 'Enter' && document.activeElement === detailDownloadBtn) {
        e.preventDefault();
        downloadFromDetail();
      }
      return;
    }

    // Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      if (currentView === 'downloads' || currentView === 'discover') {
        switchView('search');
      } else if (searchInput.value) {
        searchInput.value = '';
        resultsList.innerHTML = '';
        resultsStatus.textContent = '';
        searchResults = [];
        searchInput.focus();
      }
      return;
    }

    // Search input: let typing work, arrow down moves to results
    if (document.activeElement === searchInput) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        e.preventDefault();
        const first = resultsList.querySelector('.result-row');
        if (first) first.focus();
      }
      return;
    }

    // Nav bar
    if (document.activeElement?.classList.contains('nav-tab')) {
      const tabs = [...navTabs];
      const idx = tabs.indexOf(document.activeElement);
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        const view = tabs[idx - 1].dataset.view;
        switchView(view);
        tabs[idx - 1].focus();
      } else if (e.key === 'ArrowRight' && idx < tabs.length - 1) {
        e.preventDefault();
        const view = tabs[idx + 1].dataset.view;
        switchView(view);
        tabs[idx + 1].focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentView === 'search') {
          catBtns[0].focus();
        } else if (currentView === 'downloads') {
          const first = downloadsList.querySelector('.download-row');
          if (first) first.focus();
        } else if (currentView === 'discover') {
          focusDiscoverPoster(0, 0);
        }
      }
      return;
    }

    // Category bar
    if (document.activeElement?.classList.contains('cat-btn')) {
      const btns = [...catBtns];
      const idx = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx > 0) btns[idx - 1].focus(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < btns.length - 1) btns[idx + 1].focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); setCategory(document.activeElement.dataset.cat); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); searchInput.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navBar.querySelector('.nav-tab.active').focus(); }
      return;
    }

    // Results navigation
    if (currentView === 'search' && document.activeElement?.classList.contains('result-row')) {
      const rows = [...resultsList.querySelectorAll('.result-row')];
      const idx = rows.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') { e.preventDefault(); if (idx < rows.length - 1) rows[idx + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx > 0) rows[idx - 1].focus(); else searchInput.focus(); }
      else if (e.key === 'Enter') { e.preventDefault(); downloadResult(parseInt(document.activeElement.dataset.index)); }
      return;
    }

    // Downloads navigation
    if (currentView === 'downloads' && document.activeElement?.classList.contains('download-row')) {
      const rows = [...downloadsList.querySelectorAll('.download-row')];
      const idx = rows.indexOf(document.activeElement);

      if (e.key === 'ArrowDown') { e.preventDefault(); if (idx < rows.length - 1) rows[idx + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx > 0) rows[idx - 1].focus(); else navBar.querySelector('.nav-tab.active').focus(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteDownload(document.activeElement.dataset.id); }
      return;
    }

    // Discover poster navigation
    if (currentView === 'discover' && document.activeElement?.classList.contains('poster-card')) {
      const row = discoverFocusRow;
      const col = discoverFocusCol;
      const rowLen = getDiscoverRowLength(row);

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (col < rowLen - 1) focusDiscoverPoster(row, col + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (col > 0) focusDiscoverPoster(row, col - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (row < discoverData.length - 1) {
          const nextLen = getDiscoverRowLength(row + 1);
          focusDiscoverPoster(row + 1, Math.min(col, nextLen - 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (row > 0) {
          const prevLen = getDiscoverRowLength(row - 1);
          focusDiscoverPoster(row - 1, Math.min(col, prevLen - 1));
        } else {
          navBar.querySelector('.nav-tab.active').focus();
          discoverBackdrop.classList.remove('visible');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openDetailPanel(row, col);
      }
      return;
    }
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
