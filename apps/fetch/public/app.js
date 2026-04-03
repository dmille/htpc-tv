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

  // Rating icons
  // RT Fresh tomato (from rottentomatoes.com production bundle)
  const ICON_RT_FRESH = '<svg class="rating-icon" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><g transform="translate(10.1,0)"><mask id="rtf" fill="#fff"><polygon points="0 0.12 59.6 0.12 59.6 80 0 80"/></mask><path d="M2.53 19.1c.23 4.9 12.36 8.78 27.27 8.69 13.02-.07 23.89-3.15 26.55-7.19a4.3 4.3 0 0 0-2.39-.73c.01-.12.02-.24.01-.36a3.26 3.26 0 0 0-3.28-3.83c.05-.25.07-.51.07-.78a3.93 3.93 0 0 0-3.93-3.88h-.14c.14-.4.22-.83.21-1.28A3.93 3.93 0 0 0 43 5.34c-.5 0-.97.1-1.4.27A3.94 3.94 0 0 0 38.4 3.54c-.24-1.94-1.89-3.43-3.9-3.42-1.26.01-2.37.61-3.08 1.54a3.92 3.92 0 0 0-2.9-.27c-.44.17-.82.42-1.16.66A3.94 3.94 0 0 0 18.83 3.88c-1.69.01-3.13 1.1-3.66 2.61a4.32 4.32 0 0 0-2.43 3.64c0 .37.06.72.15 1.05-.48-.21-1.02-.33-1.59-.33A3.94 3.94 0 0 0 7.64 13.48c-.51-.23-1.07-.37-1.67-.36a3.94 3.94 0 0 0-3.9 3.92c0 .71.2 1.38.53 1.95l-.1.1" fill="#F9D320" mask="url(#rtf)"/><path d="M50.97 68.16c-1.15 1.74-3.37 3.54-5.7 4.74l3.98-40.42a53 53 0 0 0 6.84-3.44l-5.11 39.11zm-9.67 6.43c-3.86 1.28-6.1 1.67-9.31 1.99l.5-41.53c3.55-.1 8.14-.58 12.05-1.42l-3.24 40.96zm-23-6.43l-3.24-40.97c3.91.84 8.5 1.32 12.05 1.42l.5 41.53c-3.21-.31-5.45-.71-9.31-1.99zm-9.67-6.43L3.52 29.04c1.82 1.55 4.3 2.63 6.83 3.44l3.99 40.42c-2.33-1.2-4.56-3-5.7-4.74zM50.69 13.61c.05.25.08.5.08.76 0 .27-.03.53-.07.77a3.26 3.26 0 0 1 3.28 3.83c.01.12.01.24.01.36.94.13 1.78.59 2.39 1.26-2.66 4.04-13.53 7.12-26.55 7.19C15.89 27.88 2.76 24 2.53 19.1l.1-.11a4.1 4.1 0 0 1-.47-1.3C.73 19.05-.13 20.14.02 21.74l6.32 45.33c.73 7.15 11.1 12.86 23.47 12.93 12.36-.07 22.74-5.78 23.47-12.93l6.3-45.33c.3-3.18-3.42-6.07-8.9-8.12z" fill="#DB382A" mask="url(#rtf)"/></g><path d="M25.16 33.63l3.24 40.96c3.86 1.28 6.1 1.67 9.31 1.99l-.5-41.53c-3.55-.1-8.14-.58-12.05-1.42" fill="#FFFFFE"/><path d="M42.09 76.58c3.21-.32 5.45-.71 9.31-1.99l3.24-40.96c-3.91.84-8.5 1.32-12.05 1.42l-.5 41.53" fill="#FFFFFE"/><path d="M55.37 72.9c2.33-1.2 4.56-3 5.7-4.74l5.11-39.11c-1.82 1.55-4.3 2.63-6.83 3.44L55.37 72.9" fill="#FFFFFE"/><path d="M13.62 29.04l-5.11 39.11c1.15 1.74 3.37 3.54 5.7 4.74l-3.98-40.42c-2.54-.81-5.02-1.89-6.83-3.44l10.23.01" fill="#FFFFFE"/></svg>';
  // RT Rotten splat (from rottentomatoes.com production bundle)
  const ICON_RT_ROTTEN = '<svg class="rating-icon" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0,12.46)"><path d="M45.48 39.62c.47-1.17 2.15-1.88 3.35-1.8 1.29.09 2.65 1.44 2.89 2.77l.14-.14c.41-.39.93-.66 1.5-.73-.09-.38-.11-.8-.05-1.22a2.82 2.82 0 0 1 2.76-2.58c.88.01 1.65.46 2.15 1.15l.14-.16c.58-2.99.94-6.37 1.02-9.96.28-12.34-2.85-22.41-6.99-22.51-4.15-.1-7.74 9.82-8.02 22.16 0 0-.22 4.5 1.11 13.02" fill="#185A30"/><path d="M73.54 53.11a2.46 2.46 0 0 0 .37-1.42c.08-1.68-1.08-3.21-2.68-3.04.05-.19.08-.39.09-.6a3.09 3.09 0 0 0-2.6-3.25h-.1c.16-.42.24-.89.21-1.38a2.82 2.82 0 0 0-2.3-2.82 2.51 2.51 0 0 0-1.3.1 2.57 2.57 0 0 0-2.16-1.78c-.08-1.53-1.18-2.78-2.6-2.88-.89-.06-1.71.35-2.26 1.03a2.82 2.82 0 0 0-2.15-1.15 2.82 2.82 0 0 0-2.76 2.58c-.06.42-.04.83.05 1.22-.57.07-1.09.33-1.5.73l-.14.14c-.24-1.33-1.6-2.68-2.89-2.77-1.2-.08-2.88.65-3.35 1.8.2 2.01 1.46 7.49 6 12.41h.04a2.82 2.82 0 0 0 1.62.56c.38-.03.73-.17 1.03-.38l.07.01c.4.28.88.42 1.39.38.19-.02.38-.06.56-.13a2.82 2.82 0 0 0 2.49 1.39c.84-.07 1.55-.61 1.97-1.26l.14.01a2.1 2.1 0 0 0 1.58.64c.5.75 1.41 1.21 2.42 1.12.38-.03.73-.14 1.05-.31a2.82 2.82 0 0 0 2.34.95 2.82 2.82 0 0 0 2.16-1.32c.42.34.95.52 1.52.47a2.2 2.2 0 0 0 1.4-.7l.06.01.22-.37.01-.01.03-.02" fill="#F9D320"/><path d="M42.21 9.21L6.56 12.73c1.06-2.06 2.65-4.02 4.19-5.03l34.5-4.51c-1.37 1.61-2.32 3.79-3.04 6.03zm3.04 40.34L10.75 45.04c-1.54-1.01-3.13-2.97-4.19-5.03l35.65 3.51c.72 2.24 1.67 4.42 3.04 6.03zM5.08 36.51C3.95 33.11 3.6 31.13 3.32 28.3l36.63.44c.09 3.13.52 7.18 1.25 10.63L5.08 36.51zm0-20.29l36.13-2.86c-.74 3.45-1.16 7.5-1.25 10.63l-36.63.44C3.6 21.61 3.95 19.63 5.08 16.22zM56.72 3.85C54.43 1.19 52.79-.06 51.39.1L11.4 5.67C5.1 6.31.06 15.47 0 26.37c.06 10.9 5.1 20.06 11.4 20.7l39.98 5.56c.33 0 .66-.04.99-.13-.31-.09-.6-.26-.85-.48h-.04c-4.55-4.92-5.8-10.4-6-12.41 0 0 0 0 0 0-1.33-8.51-1.11-13.01-1.11-13.01.28-12.34 3.88-22.26 8.02-22.16 4.15.1 7.27 10.17 6.99 22.51-.08 3.59-.45 6.97-1.02 9.96.59-.65 1.38-.93 2.12-.88.14.01.27.03.4.06 2.52-13.78-.11-27.23-4.14-32.25z" fill="#129B47"/></g><path d="M41.2 25.83L5.08 28.69c-1.13-3.4-1.48-5.38-1.76-8.21l36.63-.44c.09 3.13.52 7.18 1.25 10.63l.01-.84" fill="#FFFFFE"/><path d="M45.24 15.65L10.75 20.16c-1.54-1.01-3.13-2.97-4.19-5.03l35.65-3.51c.72 2.24 1.67 4.42 3.04 6.03" fill="#FFFFFE"/><path d="M6.56 52.47c1.06 2.06 2.65 4.02 4.19 5.03l34.5 4.51c-1.37-1.61-2.32-3.79-3.04-6.03L6.56 52.47" fill="#FFFFFE"/><path d="M39.95 40.93L3.32 40.5c.28 2.83.63 4.81 1.76 8.21l36.13 2.86c-.74-3.45-1.16-7.5-1.25-10.63" fill="#FFFFFE"/></svg>';
  // IMDb (Simple Icons, CC0)
  const ICON_IMDB = '<svg class="rating-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.38 0H1.62C.74.06.06.74 0 1.6v20.78c.06.88.71 1.54 1.56 1.62h20.88c.87-.08 1.56-.83 1.56-1.71V1.71c0-.89-.7-1.64-1.58-1.71zM22.38.5c.6.05 1.07.52 1.13 1.21v20.58c0 .64-.49 1.16-1.1 1.21H1.6c-.6-.05-1.06-.53-1.1-1.13V1.63C.54 1.02 1.02.54 1.62.5h20.76zM4.8 8.26v7.36H2.89V8.26H4.8zm6.54 0v7.36H9.67v-4.97l-.67 4.97H7.81l-.7-4.86-.01 4.86H5.44V8.26h2.47l.5 3.45.44-3.45h2.48zm2.98 1.33c.07.04.12.11.14.2.03.1.03.31.03.65v2.85c0 .49-.03.79-.1.9-.06.11-.23.17-.5.17V9.52c.2 0 .35.02.42.07zm-.02 6.03c.45 0 .8-.03 1.02-.07.23-.05.42-.14.57-.26.16-.12.26-.3.33-.52.06-.22.1-.66.1-1.32v-2.58c0-.7-.03-1.17-.07-1.4-.04-.24-.14-.46-.31-.65-.17-.2-.42-.33-.75-.42-.32-.08-.85-.13-1.77-.13h-1.42v7.36h2.3zm5.14-1.78c0 .35-.02.58-.05.67-.03.09-.19.14-.3.14-.11 0-.19-.05-.23-.14-.04-.09-.06-.3-.06-.62v-1.95c0-.33.02-.54.05-.62.03-.08.11-.12.22-.12.12 0 .27.04.31.14.04.09.06.3.06.6v1.9zm-2.47-5.58v7.36h1.72l.12-.47c.16.19.33.33.52.43.18.09.46.14.68.14.3 0 .56-.07.78-.24.22-.16.36-.35.42-.56.05-.22.09-.54.09-.98v-2.07c0-.44-.01-.73-.03-.87-.02-.14-.07-.28-.17-.42-.1-.14-.24-.25-.43-.33-.18-.07-.4-.12-.66-.12-.22 0-.5.05-.68.13-.18.09-.35.22-.51.4V8.26h-1.83z"/></svg>';
  // TMDB (Simple Icons, CC0)
  const ICON_TMDB = '<svg class="rating-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 12a2.29 2.29 0 0 1 2.29-2.3h-.01a2.29 2.29 0 0 1 2.29 2.3 2.29 2.29 0 0 1-2.29 2.29h.01A2.29 2.29 0 0 1 6.62 12zm10.72-4.06h4.27a2.29 2.29 0 0 0 2.29-2.29 2.29 2.29 0 0 0-2.29-2.3h-4.27a2.29 2.29 0 0 0-2.29 2.3 2.29 2.29 0 0 0 2.29 2.29zM2.69 20.65h8.28a2.29 2.29 0 0 0 2.29-2.29 2.29 2.29 0 0 0-2.29-2.3H2.69a2.29 2.29 0 0 0-2.29 2.3 2.29 2.29 0 0 0 2.29 2.29z"/></svg>';

  function rtIcon(score) {
    return score >= 60 ? ICON_RT_FRESH : ICON_RT_ROTTEN;
  }

  function ratingPillsHtml(ratings, tmdbRating) {
    const pills = [];
    if (ratings && ratings.rt) {
      const cls = ratings.rt >= 60 ? 'fresh' : 'rotten';
      pills.push(`<span class="rating-pill rating-pill-rt ${cls}">${rtIcon(ratings.rt)} ${ratings.rt}%</span>`);
    }
    if (ratings && ratings.imdb) {
      pills.push(`<span class="rating-pill rating-pill-imdb">${ICON_IMDB} ${ratings.imdb}</span>`);
    }
    if (tmdbRating) {
      pills.push(`<span class="rating-pill rating-pill-tmdb">${ICON_TMDB} ${tmdbRating.toFixed(1)}</span>`);
    }
    return pills.join('');
  }

  function posterRatingHtml(ratings, tmdbRating) {
    const parts = [];
    if (ratings && ratings.rt) {
      const cls = ratings.rt >= 60 ? 'fresh' : 'rotten';
      parts.push(`<span class="poster-rating poster-rating-rt ${cls}">${rtIcon(ratings.rt)} ${ratings.rt}%</span>`);
    }
    if (ratings && ratings.imdb) {
      parts.push(`<span class="poster-rating poster-rating-imdb">${ICON_IMDB} ${ratings.imdb}</span>`);
    }
    return parts.join('');
  }

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
    history.replaceState(null, '', `/${view === 'search' ? '' : view}`);
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
        const ratingsHtml = posterRatingHtml(item.ratings, item.tmdbRating);
        return `
          <div class="poster-card" tabindex="0" data-row="${rowIdx}" data-col="${colIdx}">
            <img src="${poster}" alt="${escapeHtml(item.title)}" loading="lazy">
            <div class="poster-card-title">${escapeHtml(item.title)}</div>
            <div class="poster-card-year">${item.year || ''}</div>
            ${ratingsHtml ? `<div class="poster-ratings">${ratingsHtml}</div>` : ''}
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

    // Clean up any previously injected credits
    document.querySelectorAll('.detail-credits').forEach(el => el.remove());

    // Set content
    detailPoster.src = detailItem.poster || '';
    detailTitle.textContent = detailItem.title;
    detailMeta.textContent = [detailItem.year, detailItem.mediaType === 'tv' ? 'TV Series' : 'Movie'].filter(Boolean).join(' \u2022 ');
    detailOverview.textContent = detailItem.overview || '';

    // Ratings
    detailRatings.innerHTML = ratingPillsHtml(detailItem.ratings, detailItem.tmdbRating);

    // Backdrop
    if (detailItem.backdrop) {
      detailBackdrop.style.backgroundImage = `url(${detailItem.backdrop})`;
    }

    // Show button immediately in searching state
    detailTorrentEl.innerHTML = '';
    detailDownloadBtn.classList.remove('hidden', 'success');
    detailDownloadBtn.classList.add('searching');
    detailDownloadBtn.textContent = 'Finding torrent...';
    detailDownloadBtn.disabled = true;
    detailUnavailable.classList.add('hidden');

    // Show panel
    detailPanel.classList.remove('hidden', 'closing');
    setTimeout(() => detailDownloadBtn.focus(), 300);

    // Search for torrent
    try {
      const url = `/api/discover/item/${detailItem.tmdbId}?type=${detailItem.mediaType}`;
      console.log('[detail] Fetching torrent:', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      // Update detail info with extra metadata
      if (data.detail) {
        const d = data.detail;
        const metaParts = [detailItem.year];
        if (d.runtime) metaParts.push(`${d.runtime} min`);
        if (d.genres && d.genres.length) metaParts.push(d.genres.slice(0, 3).join(', '));
        detailMeta.textContent = metaParts.filter(Boolean).join(' \u2022 ');

        const extraParts = [];
        if (d.directors && d.directors.length) {
          extraParts.push(`<div class="detail-credits"><span class="detail-credits-label">Director</span> ${escapeHtml(d.directors.join(', '))}</div>`);
        }
        if (d.cast && d.cast.length) {
          extraParts.push(`<div class="detail-credits"><span class="detail-credits-label">Cast</span> ${d.cast.map(c => escapeHtml(c.name)).join(', ')}</div>`);
        }
        if (d.tagline) {
          detailOverview.textContent = d.tagline + ' — ' + (detailItem.overview || '');
        }
        if (extraParts.length) {
          detailRatings.insertAdjacentHTML('afterend', extraParts.join(''));
        }
      }

      if (data.available && data.torrent) {
        detailTorrent = data.torrent;
        detailTorrentEl.innerHTML = `
          <div class="detail-torrent-info">
            <span class="badge badge-resolution-1080p">${data.torrent.resolution || '1080p'}</span>
            <span class="badge badge-size">${data.torrent.size}</span>
            <span style="color: var(--text-muted)">${data.torrent.seeders} seeds</span>
          </div>
        `;
        detailDownloadBtn.classList.remove('searching');
        detailDownloadBtn.disabled = false;
        detailDownloadBtn.textContent = 'Download';
        detailDownloadBtn.focus();
      } else {
        detailDownloadBtn.classList.remove('searching');
        detailDownloadBtn.classList.add('hidden');
        detailDownloadBtn.disabled = true;
        detailUnavailable.classList.remove('hidden');
      }
    } catch (err) {
      console.error('[detail] Torrent search failed:', err);
      detailDownloadBtn.classList.remove('searching');
      detailDownloadBtn.classList.add('hidden');
      detailDownloadBtn.disabled = true;
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

  let downloadInProgress = false;

  async function downloadFromDetail() {
    if (!detailTorrent || !detailItem || downloadInProgress) return;
    if (detailDownloadBtn.disabled) return;

    downloadInProgress = true;
    detailDownloadBtn.disabled = true;
    detailDownloadBtn.textContent = 'Submitting...';
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

      detailDownloadBtn.textContent = 'Added!';
      detailDownloadBtn.classList.remove('downloading');
      detailDownloadBtn.classList.add('success');

      // Mark poster as downloaded
      const card = discoverRows.querySelector(`.poster-card[data-row="${discoverFocusRow}"][data-col="${discoverFocusCol}"]`);
      if (card) card.classList.add('downloaded');

      // Auto-dismiss after 1.5s
      setTimeout(closeDetailPanel, 1500);
    } catch (err) {
      detailDownloadBtn.textContent = 'Failed — Tap to Retry';
      detailDownloadBtn.classList.remove('downloading');
      detailDownloadBtn.disabled = false;
    }

    downloadInProgress = false;
  }

  detailDownloadBtn.addEventListener('click', downloadFromDetail);
  document.getElementById('detailCloseBtn').addEventListener('click', closeDetailPanel);

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
  const initPath = location.pathname.replace(/^\//, '') || 'search';
  const initView = ['discover', 'downloads'].includes(initPath) ? initPath : 'search';
  if (initView !== 'search') {
    switchView(initView);
  } else {
    searchInput.focus();
  }
})();
