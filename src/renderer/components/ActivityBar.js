class ActivityBar {
  constructor(ui) {
    this.ui = ui;
  }

/**
   * Activity bar management
   */
  setActiveActivity(activityId) {
    document.querySelectorAll('.activity-item').forEach(item => {
      item.classList.remove('active');
    });
    const element = document.getElementById(activityId);
    if (element) {
      element.classList.add('active');
    }
  }

  showExplorer() {
    this.ui.setActiveActivity('explorer-activity');
    const sidebarTitle = document.getElementById('sidebar-title');
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('search-view');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarTitle) sidebarTitle.textContent = 'Explorer';
    if (explorerView) explorerView.style.display = 'block';
    if (searchView) searchView.style.display = 'none';
    if (sidebar && sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
    if (sidebar && sidebar.style.width === '0px') {
      sidebar.style.minWidth = '180px';
      sidebar.style.width = '280px';
    }
  }

  showSearch() {
    this.ui.setActiveActivity('search-activity');
    const sidebarTitle = document.getElementById('sidebar-title');
    const explorerView = document.getElementById('explorer-view');
    const searchView = document.getElementById('search-view');
    const sidebar = document.getElementById('sidebar');
    const searchInput = document.getElementById('sidebar-search-input');
    
    if (sidebarTitle) sidebarTitle.textContent = 'Search';
    if (explorerView) explorerView.style.display = 'none';
    if (searchView) searchView.style.display = 'block';
    if (sidebar && sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
    }
    if (sidebar && sidebar.style.width === '0px') {
      sidebar.style.minWidth = '180px';
      sidebar.style.width = '280px';
    }
    setTimeout(() => searchInput && searchInput.focus(), 100);
  }

/**
   * Sidebar toggle
   */
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (sidebar.style.width === '0px' || sidebar.style.display === 'none') {
      sidebar.style.display = 'flex';
      sidebar.offsetHeight; // force reflow so transition fires
      sidebar.style.minWidth = '180px';
      sidebar.style.width = '280px';
    } else {
      sidebar.style.minWidth = '0px';
      sidebar.style.width = '0px';
      setTimeout(() => {
        sidebar.style.display = 'none';
      }, 200);
    }
  }

}

window.ActivityBar = ActivityBar;
