/**
 * PUSTAKA COZY - Main Application Logic
 * Features:
 * - Real-time library search & book availability check
 * - Live Barcode / ISBN Scanner (Camera + Handheld USB Scanner)
 * - Metadata Auto-fetch from Google Books API & Open Library API
 * - Cover OCR Reader for books without ISBN (via Tesseract.js)
 * - Bulk Scan Mode for scanning hundreds of books rapidly
 * - LocalStorage persistence with JSON / CSV Export & Import
 * - Category Recommendations (Stage 2)
 */

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================
const STORAGE_KEY = 'cozy_library_books_v1';
let books = [];
let html5QrCode = null;
let currentCameraId = null;
let isScannerRunning = false;
let activeCategory = 'all';
let currentSearchTerm = '';
let currentSort = 'newest';
let isBulkMode = false;

// Audio context for barcode beep synthesis
let audioCtx = null;

// Demo books for testing
const DEMO_BOOKS = [
  {
    id: 'demo-1',
    title: 'Bumi Manusia',
    author: 'Pramoedya Ananta Toer',
    isbn: '9789799731234',
    category: 'Fiksi & Sastra',
    cover: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
    description: 'Kisah roman sejarah berlatar era kolonial Hindia Belanda tentang perjuangan Minke dan Annelies.',
    status: 'Tersedia',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-2',
    title: 'Atomic Habits: Perubahan Kecil yang Memberikan Hasil Luar Biasa',
    author: 'James Clear',
    isbn: '9786020633176',
    category: 'Pengembangan Diri',
    cover: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80',
    description: 'Panduan praktis membentuk kebiasaan baik dan menghilangkan kebiasaan buruk secara bertahap.',
    status: 'Tersedia',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-3',
    title: 'Sapiens: Riwayat Singkat Umat Manusia',
    author: 'Yuval Noah Harari',
    isbn: '9786024244163',
    category: 'Sejarah & Budaya',
    cover: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80',
    description: 'Penjelajahan komprehensif perjalanan evolusi Homo sapiens dari zaman batu hingga modern.',
    status: 'Tersedia',
    createdAt: new Date().toISOString()
  }
];

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const booksGrid = document.getElementById('booksGrid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const categoryChips = document.getElementById('categoryChips');
const sortBySelect = document.getElementById('sortBy');
const resultsCountBadge = document.getElementById('resultsCountBadge');
const totalBooksCount = document.getElementById('totalBooksCount');
const totalCategoriesCount = document.getElementById('totalCategoriesCount');
const recentlyAddedCount = document.getElementById('recentlyAddedCount');
const recommendationSection = document.getElementById('recommendationSection');
const recommendationCarousel = document.getElementById('recommendationCarousel');

// Modals
const scannerModal = document.getElementById('scannerModal');
const bookFormModal = document.getElementById('bookFormModal');
const bookDetailsModal = document.getElementById('bookDetailsModal');
const backupModal = document.getElementById('backupModal');

// Form Elements
const bookForm = document.getElementById('bookForm');
const formTitle = document.getElementById('formTitle');
const formAuthor = document.getElementById('formAuthor');
const formIsbn = document.getElementById('formIsbn');
const formCategory = document.getElementById('formCategory');
const formDescription = document.getElementById('formDescription');
const coverUrlInput = document.getElementById('coverUrlInput');
const coverLocalInput = document.getElementById('coverLocalInput');
const formCoverPreview = document.getElementById('formCoverPreview');
const formCoverPlaceholder = document.getElementById('formCoverPlaceholder');
const editBookId = document.getElementById('editBookId');

// ==========================================
// 3. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadBooksFromStorage();
  initLucideIcons();
  setupEventListeners();
  renderApp();
});

function initLucideIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function loadBooksFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      books = JSON.parse(raw);
    } else {
      books = [];
    }
  } catch (e) {
    console.error('Gagal membaca data dari LocalStorage:', e);
    books = [];
  }
}

function saveBooksToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
    renderApp();
  } catch (e) {
    console.error('Gagal menyimpan ke LocalStorage:', e);
    showToast('Gagal menyimpan data ke penyimpanan browser!', 'error');
  }
}

// ==========================================
// 4. RENDERING & FILTERING
// ==========================================
function renderApp() {
  updateStats();
  renderCategoryChips();
  renderBooksList();
  renderRecommendations();
  initLucideIcons();
}

function updateStats() {
  totalBooksCount.textContent = books.length;
  
  const categories = new Set(books.map(b => b.category?.trim()).filter(Boolean));
  totalCategoriesCount.textContent = categories.size;

  const today = new Date().toDateString();
  const addedToday = books.filter(b => {
    if (!b.createdAt) return false;
    return new Date(b.createdAt).toDateString() === today;
  }).length;
  recentlyAddedCount.textContent = addedToday;
}

function renderCategoryChips() {
  const categories = Array.from(new Set(books.map(b => b.category?.trim()).filter(Boolean))).sort();

  let html = `
    <button class="chip ${activeCategory === 'all' ? 'active' : ''}" data-category="all">
      Semua Kategori (${books.length})
    </button>
  `;

  categories.forEach(cat => {
    const count = books.filter(b => b.category?.trim() === cat).length;
    html += `
      <button class="chip ${activeCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}">
        ${escapeHtml(cat)} (${count})
      </button>
    `;
  });

  categoryChips.innerHTML = html;

  // Add click handlers
  categoryChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeCategory = chip.dataset.category;
      renderApp();
    });
  });
}

function getFilteredAndSortedBooks() {
  let filtered = [...books];

  // Category filter
  if (activeCategory !== 'all') {
    filtered = filtered.filter(b => b.category?.trim() === activeCategory);
  }

  // Search keyword filter
  if (currentSearchTerm.trim()) {
    const term = currentSearchTerm.trim().toLowerCase();
    filtered = filtered.filter(b => {
      const matchTitle = b.title && b.title.toLowerCase().includes(term);
      const matchAuthor = b.author && b.author.toLowerCase().includes(term);
      const matchIsbn = b.isbn && b.isbn.toLowerCase().includes(term);
      const matchCategory = b.category && b.category.toLowerCase().includes(term);
      return matchTitle || matchAuthor || matchIsbn || matchCategory;
    });
  }

  // Sorting
  filtered.sort((a, b) => {
    if (currentSort === 'newest') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    } else if (currentSort === 'titleAsc') {
      return (a.title || '').localeCompare(b.title || '');
    } else if (currentSort === 'authorAsc') {
      return (a.author || '').localeCompare(b.author || '');
    } else if (currentSort === 'category') {
      return (a.category || '').localeCompare(b.category || '');
    }
    return 0;
  });

  return filtered;
}

function renderBooksList() {
  const filtered = getFilteredAndSortedBooks();
  resultsCountBadge.textContent = `${filtered.length} buku`;

  if (books.length === 0) {
    booksGrid.style.display = 'none';
    emptyState.style.display = 'block';
    document.getElementById('emptyStateTitle').textContent = 'Perpustakaan Masih Kosong';
    document.getElementById('emptyStateMsg').textContent = 'Belum ada buku yang tersimpan. Mulai scan barcode ratusan buku Anda atau tambahkan secara manual!';
    return;
  }

  if (filtered.length === 0) {
    booksGrid.style.display = 'none';
    emptyState.style.display = 'block';
    document.getElementById('emptyStateTitle').textContent = 'Buku Tidak Ditemukan';
    document.getElementById('emptyStateMsg').textContent = `Tidak ada koleksi buku yang cocok dengan pencarian "${escapeHtml(currentSearchTerm)}".`;
    return;
  }

  emptyState.style.display = 'none';
  booksGrid.style.display = 'grid';

  booksGrid.innerHTML = filtered.map(book => {
    const coverHtml = book.cover ? `
      <img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" class="book-cover-img" onerror="this.onerror=null; this.parentElement.innerHTML='${getSpineFallbackHtml(book)}'">
    ` : getSpineFallbackHtml(book);

    return `
      <article class="book-card" data-id="${book.id}">
        <div class="book-cover-container">
          ${coverHtml}
          <div class="status-badge available" title="Tersedia di perpustakaan">
            <span class="status-dot"></span>
            <span>Tersedia</span>
          </div>
        </div>

        <div class="book-content">
          <span class="book-category-tag">${escapeHtml(book.category || 'Umum')}</span>
          <h4 class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h4>
          <p class="book-author">${escapeHtml(book.author || 'Penulis Tidak Diketahui')}</p>

          <div class="book-meta">
            <span class="book-isbn-text">
              <i data-lucide="barcode" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i>
              ${book.isbn ? escapeHtml(book.isbn) : 'Tanpa ISBN'}
            </span>
          </div>

          <div class="book-card-actions">
            <button class="btn btn-secondary btn-sm btn-view-book" data-id="${book.id}">
              <i data-lucide="eye"></i> Detail
            </button>
            <button class="btn btn-outline btn-sm btn-edit-book" data-id="${book.id}" title="Edit Buku">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-delete-book" data-id="${book.id}" title="Hapus Buku">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Attach card event listeners
  booksGrid.querySelectorAll('.btn-view-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBookDetails(btn.dataset.id);
    });
  });

  booksGrid.querySelectorAll('.btn-edit-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBookEdit(btn.dataset.id);
    });
  });

  booksGrid.querySelectorAll('.btn-delete-book').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteBook(btn.dataset.id);
    });
  });
}

function getSpineFallbackHtml(book) {
  const safeTitle = escapeHtml(book.title || 'Buku');
  const safeAuthor = escapeHtml(book.author || '');
  return `
    <div class="book-spine-fallback">
      <div class="spine-title">${safeTitle}</div>
      <div class="spine-author">${safeAuthor}</div>
    </div>
  `;
}

// Stage 2: Render Recommendations by popular categories
function renderRecommendations() {
  if (books.length < 3) {
    recommendationSection.style.display = 'none';
    return;
  }

  recommendationSection.style.display = 'block';

  // Group books by category
  const categoryCounts = {};
  books.forEach(b => {
    const cat = b.category || 'Umum';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  // Pick top categories
  const sortedCategories = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
  const topCategory = sortedCategories[0];
  const recommendedBooks = books.filter(b => (b.category || 'Umum') === topCategory).slice(0, 4);

  recommendationCarousel.innerHTML = recommendedBooks.map(b => `
    <div class="rec-mini-card" onclick="openBookDetails('${b.id}')">
      <h5>${escapeHtml(b.title)}</h5>
      <span><i data-lucide="user" style="width: 12px; height: 12px; display: inline-block;"></i> ${escapeHtml(b.author)}</span>
      <span style="margin-top: 0.4rem; color: var(--cozy-caramel); font-weight: 600;">Kategori: ${escapeHtml(b.category)}</span>
    </div>
  `).join('');
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Search
  searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value;
    clearSearchBtn.style.display = currentSearchTerm ? 'flex' : 'none';
    renderBooksList();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearchTerm = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    renderBooksList();
  });

  // Sort
  sortBySelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderBooksList();
  });

  // Modals Open / Close
  document.getElementById('btnOpenScanner').addEventListener('click', openScannerModal);
  document.getElementById('heroScanTrigger').addEventListener('click', openScannerModal);
  document.getElementById('btnCloseScanner').addEventListener('click', closeScannerModal);

  document.getElementById('btnOpenBackup').addEventListener('click', () => openModal(backupModal));
  document.getElementById('btnCloseBackup').addEventListener('click', () => closeModal(backupModal));

  document.getElementById('btnCloseBookForm').addEventListener('click', () => closeModal(bookFormModal));
  document.getElementById('btnCancelBookForm').addEventListener('click', () => closeModal(bookFormModal));
  document.getElementById('btnCloseDetails').addEventListener('click', () => closeModal(bookDetailsModal));

  // Empty state buttons
  document.getElementById('btnEmptyScan').addEventListener('click', openScannerModal);
  document.getElementById('btnLoadDemo').addEventListener('click', loadDemoData);

  // Modal Backdrop click to close
  [scannerModal, bookFormModal, bookDetailsModal, backupModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal === scannerModal) {
          closeScannerModal();
        } else {
          closeModal(modal);
        }
      }
    });
  });

  // Scanner Modal Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tab-barcode') {
        startBarcodeScanner();
      } else {
        stopBarcodeScanner();
      }
    });
  });

  // Bulk Mode Toggle
  document.getElementById('bulkModeToggle').addEventListener('change', (e) => {
    isBulkMode = e.target.checked;
    if (isBulkMode) {
      showToast('Mode Scan Cepat aktif: Buku akan otomatis tersimpan langsung!', 'success');
    }
  });

  // Manual ISBN Lookup
  document.getElementById('btnLookupIsbn').addEventListener('click', handleManualIsbnLookup);
  document.getElementById('manualIsbnInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleManualIsbnLookup();
    }
  });

  // Cover URL live preview
  coverUrlInput.addEventListener('input', (e) => {
    updateFormCoverPreview(e.target.value);
  });

  // Cover local file upload
  coverLocalInput.addEventListener('change', handleLocalCoverUpload);

  // Book Form Submit
  bookForm.addEventListener('submit', handleBookFormSubmit);

  // Backup & Export Handlers
  document.getElementById('btnExportJson').addEventListener('click', exportToJson);
  document.getElementById('btnExportCsv').addEventListener('click', exportToCsv);
  document.getElementById('importJsonInput').addEventListener('change', handleImportJson);
  document.getElementById('btnClearAllBooks').addEventListener('click', handleClearAllBooks);

  // OCR Cover Upload
  setupOcrHandlers();
}

function openModal(modal) {
  modal.classList.add('open');
}

function closeModal(modal) {
  modal.classList.remove('open');
}

// ==========================================
// 6. BARCODE SCANNER & METADATA FETCHING
// ==========================================
function openScannerModal() {
  openModal(scannerModal);
  // Default to barcode tab
  const barcodeTab = document.querySelector('.tab-btn[data-tab="tab-barcode"]');
  if (barcodeTab) barcodeTab.click();
}

function closeScannerModal() {
  stopBarcodeScanner();
  closeModal(scannerModal);
}

async function startBarcodeScanner() {
  if (isScannerRunning) return;

  const readerElement = document.getElementById('barcodeReader');
  readerElement.innerHTML = '';

  try {
    const devices = await Html5Qrcode.getCameras();
    const cameraSelect = document.getElementById('cameraSelection');
    cameraSelect.innerHTML = '';

    if (!devices || devices.length === 0) {
      showToast('Tidak ada kamera yang ditemukan pada perangkat ini.', 'error');
      return;
    }

    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.label || `Kamera ${index + 1}`;
      cameraSelect.appendChild(option);
    });

    // Prefer back camera on smartphones
    const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('belakang') || d.label.toLowerCase().includes('environment'));
    currentCameraId = backCam ? backCam.id : devices[0].id;
    cameraSelect.value = currentCameraId;

    cameraSelect.onchange = () => {
      currentCameraId = cameraSelect.value;
      restartBarcodeScanner();
    };

    html5QrCode = new Html5Qrcode('barcodeReader');
    
    // Config optimized for 1D Barcodes (EAN-13, ISBN) & QR codes
    const config = {
      fps: 15,
      qrbox: { width: 300, height: 160 },
      aspectRatio: 1.333,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    await html5QrCode.start(
      currentCameraId,
      config,
      onBarcodeScanSuccess,
      onBarcodeScanFailure
    );

    isScannerRunning = true;
    document.getElementById('scannerLaser').style.display = 'block';
  } catch (err) {
    console.warn('Gagal memulai kamera scanner:', err);
    showToast('Akses kamera ditolak atau belum diizinkan.', 'error');
  }
}

async function restartBarcodeScanner() {
  await stopBarcodeScanner();
  await startBarcodeScanner();
}

async function stopBarcodeScanner() {
  if (html5QrCode && isScannerRunning) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {
      console.warn('Error stopping scanner:', e);
    }
  }
  isScannerRunning = false;
  document.getElementById('scannerLaser').style.display = 'none';
}

function onBarcodeScanFailure(error) {
  // Silent frame-by-frame scanner ticks
}

let lastScannedCode = '';
let scanCooldown = false;

async function onBarcodeScanSuccess(decodedText, decodedResult) {
  if (scanCooldown) return;

  const cleanCode = decodedText.trim();
  if (cleanCode === lastScannedCode) return;

  scanCooldown = true;
  playBeepSound();
  lastScannedCode = cleanCode;

  showToast(`Barcode terdeteksi: ${cleanCode}! Mengambil metadata buku...`, 'success');

  // Fetch Book Metadata
  const bookInfo = await fetchBookMetadata(cleanCode);

  if (isBulkMode) {
    // Save directly in bulk mode
    const newBook = {
      id: 'book-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title: bookInfo.title || `Buku ISBN ${cleanCode}`,
      author: bookInfo.author || 'Penulis Tidak Diketahui',
      isbn: cleanCode,
      category: bookInfo.category || 'Umum',
      cover: bookInfo.cover || '',
      description: bookInfo.description || '',
      status: 'Tersedia',
      createdAt: new Date().toISOString()
    };

    books.unshift(newBook);
    saveBooksToStorage();
    showToast(`✓ Berhasil disimpan: "${newBook.title}"`, 'success');
    fireConfetti();

    // Allow next scan after 2 seconds
    setTimeout(() => {
      scanCooldown = false;
      lastScannedCode = '';
    }, 2000);
  } else {
    // Open Confirmation Modal
    stopBarcodeScanner();
    closeModal(scannerModal);
    openBookFormWithData(bookInfo, cleanCode);
    scanCooldown = false;
  }
}

// ==========================================
// 7. ONLINE BOOK METADATA FETCHER (Google Books & OpenLibrary)
// ==========================================
async function fetchBookMetadata(isbnRaw) {
  const isbn = isbnRaw.replace(/[^0-9X]/gi, '');
  let metadata = {
    title: '',
    author: '',
    isbn: isbn,
    category: 'Fiksi & Sastra',
    cover: '',
    description: ''
  };

  try {
    // 1. Try Google Books API first
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    const gResponse = await fetch(googleUrl);
    if (gResponse.ok) {
      const gData = await gResponse.json();
      if (gData.totalItems > 0 && gData.items && gData.items.length > 0) {
        const info = gData.items[0].volumeInfo;
        metadata.title = info.title || '';
        metadata.author = (info.authors && info.authors.length > 0) ? info.authors.join(', ') : '';
        metadata.description = info.description || '';
        if (info.categories && info.categories.length > 0) {
          metadata.category = mapCategoryName(info.categories[0]);
        }
        if (info.imageLinks) {
          metadata.cover = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '';
          // Force HTTPS on Google Books image links
          if (metadata.cover.startsWith('http://')) {
            metadata.cover = metadata.cover.replace('http://', 'https://');
          }
        }
        return metadata;
      }
    }

    // 2. Fallback to Open Library API
    const openLibUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`;
    const olResponse = await fetch(openLibUrl);
    if (olResponse.ok) {
      const olData = await olResponse.json();
      const bookKey = `ISBN:${isbn}`;
      if (olData[bookKey]) {
        const info = olData[bookKey];
        metadata.title = info.title || metadata.title;
        if (info.authors && info.authors.length > 0) {
          metadata.author = info.authors.map(a => a.name).join(', ');
        }
        if (info.cover) {
          metadata.cover = info.cover.medium || info.cover.large || info.cover.small || '';
        }
        if (info.subjects && info.subjects.length > 0) {
          metadata.category = mapCategoryName(info.subjects[0].name);
        }
        return metadata;
      }
    }
  } catch (err) {
    console.warn('Gagal mengambil metadata via API online:', err);
  }

  return metadata;
}

function mapCategoryName(catRaw) {
  if (!catRaw) return 'Umum';
  const c = catRaw.toLowerCase();
  if (c.includes('fiction') || c.includes('fiksi') || c.includes('novel') || c.includes('literature')) return 'Fiksi & Sastra';
  if (c.includes('science') || c.includes('tech') || c.includes('komputer')) return 'Sains & Teknologi';
  if (c.includes('history') || c.includes('sejarah')) return 'Sejarah & Budaya';
  if (c.includes('business') || c.includes('ekonomi') || c.includes('finance')) return 'Bisnis & Ekonomi';
  if (c.includes('self-help') || c.includes('psikologi') || c.includes('motivation')) return 'Pengembangan Diri';
  if (c.includes('religion') || c.includes('filsafat') || c.includes('philosophy')) return 'Filsafat & Agama';
  return catRaw.length > 30 ? catRaw.substring(0, 30) : catRaw;
}

// Manual ISBN lookup button
async function handleManualIsbnLookup() {
  const input = document.getElementById('manualIsbnInput');
  const isbn = input.value.trim();
  if (!isbn) {
    showToast('Masukkan digit ISBN terlebih dahulu.', 'error');
    return;
  }

  showToast('Mencari data buku...', 'info');
  const metadata = await fetchBookMetadata(isbn);
  closeScannerModal();
  openBookFormWithData(metadata, isbn);
}

// ==========================================
// 8. OCR SCANNER (COVER BUKU TANPA ISBN)
// ==========================================
function setupOcrHandlers() {
  const ocrFileInput = document.getElementById('ocrFileInput');
  const btnTriggerOcrFile = document.getElementById('btnTriggerOcrFile');
  const btnOcrCameraSnap = document.getElementById('btnOcrCameraSnap');
  const ocrDropArea = document.getElementById('ocrDropArea');
  const btnUseOcrText = document.getElementById('btnUseOcrText');

  btnTriggerOcrFile.addEventListener('click', () => ocrFileInput.click());
  btnOcrCameraSnap.addEventListener('click', () => {
    // Switch to barcode camera or trigger file input with capture
    ocrFileInput.setAttribute('capture', 'environment');
    ocrFileInput.click();
  });

  ocrFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      processOcrImage(file);
    }
  });

  // Drag and drop cover image
  ocrDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    ocrDropArea.style.borderColor = 'var(--cozy-caramel)';
  });

  ocrDropArea.addEventListener('dragleave', () => {
    ocrDropArea.style.borderColor = 'var(--border-medium)';
  });

  ocrDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    ocrDropArea.style.borderColor = 'var(--border-medium)';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processOcrImage(e.dataTransfer.files[0]);
    }
  });

  btnUseOcrText.addEventListener('click', () => {
    const text = document.getElementById('ocrExtractedRaw').value;
    const previewImg = document.getElementById('ocrPreviewImg').src;
    const parsed = parseOcrCoverText(text);

    closeScannerModal();
    openBookFormWithData({
      title: parsed.title,
      author: parsed.author,
      isbn: '',
      category: 'Fiksi & Sastra',
      cover: previewImg || '',
      description: 'Hasil ekstraksi OCR teks cover buku.'
    });
  });
}

async function processOcrImage(file) {
  const ocrProcessingState = document.getElementById('ocrProcessingState');
  const ocrPreviewWrap = document.getElementById('ocrPreviewWrap');
  const ocrStatusMsg = document.getElementById('ocrStatusMsg');
  const ocrProgressFill = document.getElementById('ocrProgressFill');
  const ocrPreviewImg = document.getElementById('ocrPreviewImg');
  const ocrExtractedRaw = document.getElementById('ocrExtractedRaw');

  // Preview local image
  const reader = new FileReader();
  reader.onload = (e) => {
    ocrPreviewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);

  ocrProcessingState.style.display = 'block';
  ocrPreviewWrap.style.display = 'none';
  ocrProgressFill.style.width = '10%';
  ocrStatusMsg.textContent = 'Menyiapkan modul OCR Tesseract...';

  try {
    const worker = await Tesseract.createWorker('ind+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          ocrProgressFill.style.width = `${pct}%`;
          ocrStatusMsg.textContent = `Membaca teks dari cover (${pct}%)...`;
        }
      }
    });

    const ret = await worker.recognize(file);
    await worker.terminate();

    ocrProcessingState.style.display = 'none';
    ocrPreviewWrap.style.display = 'grid';
    ocrExtractedRaw.value = ret.data.text.trim();

    showToast('Teks cover berhasil diekstrak!', 'success');
  } catch (err) {
    console.error('OCR Error:', err);
    ocrProcessingState.style.display = 'none';
    showToast('Gagal memproses OCR gambar sampul.', 'error');
  }
}

// Simple heuristic to split Title and Author from cover OCR
function parseOcrCoverText(rawText) {
  const lines = rawText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2);

  if (lines.length === 0) {
    return { title: 'Buku Tanpa Judul', author: 'Penulis Tidak Diketahui' };
  }

  // Look for lines with 'oleh' / 'by' / 'karya' for author
  let authorIdx = lines.findIndex(l => /^(oleh|by|karya)\b/i.test(l));
  let author = '';
  let title = '';

  if (authorIdx !== -1) {
    author = lines[authorIdx].replace(/^(oleh|by|karya)\s*[:\-]?\s*/i, '').trim();
    lines.splice(authorIdx, 1);
  }

  // Longest / most prominent line is usually the title
  if (lines.length > 0) {
    title = lines[0];
    if (!author && lines.length > 1) {
      author = lines[1];
    }
  }

  return {
    title: title || 'Judul Buku Baru',
    author: author || 'Penulis'
  };
}

// ==========================================
// 9. BOOK FORM / EDIT / DETAILS MODALS
// ==========================================
function openBookFormWithData(data = {}, isbnDefault = '') {
  document.getElementById('bookFormTitle').textContent = data.id ? 'Edit Data Buku' : 'Konfirmasi Data Buku';
  editBookId.value = data.id || '';
  formTitle.value = data.title || '';
  formAuthor.value = data.author || '';
  formIsbn.value = data.isbn || isbnDefault || '';
  formCategory.value = data.category || 'Fiksi & Sastra';
  formDescription.value = data.description || '';
  coverUrlInput.value = data.cover || '';

  updateFormCoverPreview(data.cover || '');
  openModal(bookFormModal);
  formTitle.focus();
}

function updateFormCoverPreview(url) {
  if (url) {
    formCoverPreview.src = url;
    formCoverPreview.style.display = 'block';
    formCoverPlaceholder.style.display = 'none';
  } else {
    formCoverPreview.style.display = 'none';
    formCoverPlaceholder.style.display = 'flex';
  }
}

function handleLocalCoverUpload(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      coverUrlInput.value = event.target.result;
      updateFormCoverPreview(event.target.result);
    };
    reader.readAsDataURL(file);
  }
}

function handleBookFormSubmit(e) {
  e.preventDefault();

  const title = formTitle.value.trim();
  const author = formAuthor.value.trim();
  const isbn = formIsbn.value.trim();
  const category = formCategory.value.trim() || 'Umum';
  const description = formDescription.value.trim();
  const cover = coverUrlInput.value.trim();
  const id = editBookId.value;

  if (!title || !author) {
    showToast('Judul dan Penulis buku wajib diisi!', 'error');
    return;
  }

  if (id) {
    // Update existing book
    const bookIndex = books.findIndex(b => b.id === id);
    if (bookIndex !== -1) {
      books[bookIndex] = {
        ...books[bookIndex],
        title,
        author,
        isbn,
        category,
        description,
        cover,
        updatedAt: new Date().toISOString()
      };
      showToast('Data buku berhasil diperbarui!', 'success');
    }
  } else {
    // Add new book
    const newBook = {
      id: 'book-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title,
      author,
      isbn,
      category,
      description,
      cover,
      status: 'Tersedia',
      createdAt: new Date().toISOString()
    };
    books.unshift(newBook);
    showToast(`Buku "${title}" berhasil ditambahkan ke perpustakaan!`, 'success');
    fireConfetti();
  }

  saveBooksToStorage();
  closeModal(bookFormModal);
}

function openBookEdit(bookId) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;
  openBookFormWithData(book);
}

function openBookDetails(bookId) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;

  const content = document.getElementById('bookDetailsContent');
  const footer = document.getElementById('bookDetailsFooter');

  const coverHtml = book.cover ? `
    <img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" class="details-cover" onerror="this.onerror=null; this.parentElement.innerHTML='${getSpineFallbackHtml(book)}'">
  ` : getSpineFallbackHtml(book);

  content.innerHTML = `
    <div class="details-container">
      <div style="display: flex; justify-content: center;">
        ${coverHtml}
      </div>
      <div class="details-info">
        <h2>${escapeHtml(book.title)}</h2>
        <p class="details-author">Oleh: ${escapeHtml(book.author)}</p>

        <div class="details-meta-grid">
          <div class="meta-item">
            <span class="meta-lbl">ISBN / Barcode</span>
            <span class="meta-val">${book.isbn ? escapeHtml(book.isbn) : 'Tidak ada'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-lbl">Kategori</span>
            <span class="meta-val">${escapeHtml(book.category || 'Umum')}</span>
          </div>
          <div class="meta-item">
            <span class="meta-lbl">Status Ketersediaan</span>
            <span class="meta-val" style="color: var(--accent-secondary); display: flex; align-items: center; gap: 4px;">
              <span class="status-dot"></span> Tersedia di Perpustakaan
            </span>
          </div>
          <div class="meta-item">
            <span class="meta-lbl">Waktu Terdata</span>
            <span class="meta-val">${book.createdAt ? new Date(book.createdAt).toLocaleDateString('id-ID') : '-'}</span>
          </div>
        </div>

        <p class="details-desc">${escapeHtml(book.description || 'Tidak ada deskripsi tambahan untuk buku ini.')}</p>
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal(bookDetailsModal)">Tutup</button>
    <button class="btn btn-primary" onclick="closeModal(bookDetailsModal); openBookEdit('${book.id}')">
      <i data-lucide="edit-3"></i> Edit Buku
    </button>
  `;

  openModal(bookDetailsModal);
  initLucideIcons();
}

function confirmDeleteBook(bookId) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;

  if (confirm(`Apakah Anda yakin ingin menghapus buku "${book.title}" dari perpustakaan?`)) {
    books = books.filter(b => b.id !== bookId);
    saveBooksToStorage();
    showToast('Buku telah dihapus dari perpustakaan.', 'info');
  }
}

// ==========================================
// 10. BACKUP, EXPORT & IMPORT
// ==========================================
function exportToJson() {
  if (books.length === 0) {
    showToast('Belum ada data buku untuk diekspor.', 'error');
    return;
  }
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(books, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute('href', dataStr);
  dlAnchor.setAttribute('download', `cadangan_perpustakaan_${new Date().toISOString().slice(0, 10)}.json`);
  dlAnchor.click();
  showToast('File cadangan JSON berhasil diunduh!', 'success');
}

function exportToCsv() {
  if (books.length === 0) {
    showToast('Belum ada data buku untuk diekspor.', 'error');
    return;
  }

  const headers = ['Judul', 'Penulis', 'ISBN', 'Kategori', 'Status', 'Deskripsi', 'Tanggal Ditambahkan'];
  const rows = books.map(b => [
    `"${(b.title || '').replace(/"/g, '""')}"`,
    `"${(b.author || '').replace(/"/g, '""')}"`,
    `"${(b.isbn || '').replace(/"/g, '""')}"`,
    `"${(b.category || '').replace(/"/g, '""')}"`,
    `"${(b.status || 'Tersedia').replace(/"/g, '""')}"`,
    `"${(b.description || '').replace(/"/g, '""')}"`,
    `"${(b.createdAt || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `katalog_buku_perpustakaan_${new Date().toISOString().slice(0, 10)}.csv`);
  link.click();
  showToast('File CSV berhasil diunduh untuk Excel!', 'success');
}

function handleImportJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (Array.isArray(imported)) {
        if (confirm(`Ditemukan ${imported.length} buku. Apakah Anda ingin menggabungkan dengan koleksi saat ini?`)) {
          // Merge avoiding exact duplicates by ISBN or ID
          const existingIsbns = new Set(books.map(b => b.isbn).filter(Boolean));
          let addedCount = 0;

          imported.forEach(item => {
            if (item.title && item.author) {
              if (!item.isbn || !existingIsbns.has(item.isbn)) {
                books.push({
                  ...item,
                  id: item.id || ('book-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
                  createdAt: item.createdAt || new Date().toISOString()
                });
                addedCount++;
              }
            }
          });

          saveBooksToStorage();
          closeModal(backupModal);
          showToast(`Berhasil mengimpor ${addedCount} buku baru!`, 'success');
        }
      } else {
        showToast('Format file JSON tidak valid.', 'error');
      }
    } catch (err) {
      showToast('Gagal membaca file JSON.', 'error');
    }
  };
  reader.readAsText(file);
}

function handleClearAllBooks() {
  if (confirm('PERINGATAN: Apakah Anda yakin ingin MENGHAPUS SEMUA buku dari perpustakaan? Tindakan ini tidak dapat dibatalkan.')) {
    books = [];
    saveBooksToStorage();
    closeModal(backupModal);
    showToast('Seluruh koleksi perpustakaan telah dikosongkan.', 'info');
  }
}

function loadDemoData() {
  books = [...DEMO_BOOKS];
  saveBooksToStorage();
  showToast('3 Buku contoh berhasil dimuat!', 'success');
  fireConfetti();
}

// ==========================================
// 11. AUDIO CHIME & CONFETTI & UTILS
// ==========================================
function playBeepSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz A5 chime
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch (e) {
    // Audio context not allowed without prior interaction or unsupported
  }
}

function fireConfetti() {
  if (window.confetti) {
    window.confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#874b28', '#b56938', '#d48b47', '#4a6b57']
    });
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconName = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-circle' : 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  initLucideIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
