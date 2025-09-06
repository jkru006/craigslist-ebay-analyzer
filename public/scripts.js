document.addEventListener('DOMContentLoaded', function() {
  // Check if this is the initial welcome page
  const isWelcomePage = document.querySelector('.welcome-message') !== null;
  
  // Check if search button was pressed by looking for the meta tag or URL parameters
  const searchButtonMeta = document.querySelector('meta[name="search-button-pressed"]');
  let isSearchButtonPressed = searchButtonMeta && searchButtonMeta.getAttribute('content') === 'true';
  
  // Check if we're using the new sorted backend approach
  const useSortedBackendMeta = document.querySelector('meta[name="use-sorted-backend"]');
  const useSortedBackend = useSortedBackendMeta && useSortedBackendMeta.getAttribute('content') === 'true';
  
  // Also check URL for search parameters
  const urlParams = new URLSearchParams(window.location.search);
  const hasSearchParams = urlParams.has('search') && urlParams.has('zipcode');
  
  // Store search parameters for backend API calls
  const searchQuery = urlParams.get('search') || document.querySelector('input[name="search"]')?.value || 'laptop';
  const zipcode = urlParams.get('zipcode') || document.querySelector('input[name="zipcode"]')?.value || '94102';
  const budget = urlParams.get('budget') || document.querySelector('input[name="budget"]')?.value || '';
  const currentPage = parseInt(urlParams.get('page') || document.getElementById('currentPageInput')?.value || '1');
  const itemsPerPage = parseInt(urlParams.get('itemsPerPage') || '50');
  
  // If URL has search parameters, consider it as a search request
  if (hasSearchParams) {
    // Update search button pressed state based on URL parameter
    isSearchButtonPressed = urlParams.get('isSearchButtonPressed') === 'true';
    console.log('Found search parameters in URL, isSearchButtonPressed:', isSearchButtonPressed);
    
    // Clear form resubmission history by replacing the current URL with the same URL
    // This prevents the browser from showing the "confirm form resubmission" dialog
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.href);
    }
  }
  
  console.log('Is welcome page:', isWelcomePage);
  console.log('Is search button pressed:', isSearchButtonPressed);
  console.log('Using sorted backend:', useSortedBackend);
  
  // Initialize the loading overlay
  const loadingOverlay = document.getElementById('loadingOverlay');
  
  // Helper function to show/hide loading overlay
  function showLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      loadingOverlay.classList.remove('hidden');
    }
  }
  
  function hideLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
        
        // Make sure all listings are visible after loading
        const listings = document.querySelectorAll('.listing');
        listings.forEach(listing => {
          listing.classList.add('loaded');
          listing.classList.add('fade-in');
          listing.classList.remove('initially-hidden');
        });
        
        console.log('Made all listings visible after hiding overlay');
      }, 300); // Wait for animation to complete
    }
  }
  
  // If we have listings, they're initially hidden
  const allListings = document.querySelectorAll('.listing');
  
  // Setup pagination
  setupPagination();
  
  // Setup form submission with page parameter
  setupFormSubmission();
  
  // Global variable to store all listings in memory
  let allSortedListings = [];
  
  // Process listings based on the approach we're using
  if (!isWelcomePage && isSearchButtonPressed) {
    console.log('Search button was pressed, processing listings...');
    showLoadingOverlay();
    
    if (useSortedBackend) {
      // Use the new sorted backend approach - fetch all listings at once
      console.log('Using sorted backend to load all listings at once');
      loadAllSortedListings(searchQuery, zipcode, budget, currentPage, itemsPerPage);
    } else {
      // Use the original approach - process listings one by one
      const priceComparisons = document.querySelectorAll('.price-comparison');
      if (priceComparisons.length > 0) {
        console.log(`Found ${priceComparisons.length} listings to process one by one`);
        
        // Process listings one by one
        processListingsSequentially(Array.from(priceComparisons), 0);
      } else {
        hideLoadingOverlay();
      }
    }
  } else if (!isWelcomePage) {
    console.log('Not processing listings automatically - waiting for search button');
    
    // Show a message to click search
    const listingsContainer = document.getElementById('listingsContainer');
    if (listingsContainer) {
      // Remove any existing listings
      while (listingsContainer.firstChild) {
        listingsContainer.removeChild(listingsContainer.firstChild);
      }
      
      // Add "please search" message
      const noSearchMessage = document.createElement('div');
      noSearchMessage.className = 'no-results';
      noSearchMessage.innerHTML = '<p>Please click the Search button to load and process listings.</p>';
      listingsContainer.appendChild(noSearchMessage);
    }
  }
  
  /**
   * Load all listings at once from the backend, already sorted by profit
   */
  function loadAllSortedListings(searchQuery, zipcode, budget, page, itemsPerPage) {
    console.log(`Loading all sorted listings: ${searchQuery}, ${zipcode}, budget: ${budget}, page: ${page}`);
    
    fetch('/api/getAllSortedListings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ searchQuery, zipcode, budget })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log(`Received ${data.totalListings} sorted listings from the backend`);
      
      // Store all listings in memory
      allSortedListings = data.listings;
      
      // Display the current page
      displayCurrentPage(page, itemsPerPage);
      
      // Update the total count
      updatePageInfo(page, itemsPerPage, allSortedListings.length);
      
      // Hide loading overlay
      hideLoadingOverlay();
    })
    .catch(error => {
      console.error('Error fetching sorted listings:', error);
      hideLoadingOverlay();
      
      // Show error message
      const listingsContainer = document.getElementById('listingsContainer');
      if (listingsContainer) {
        listingsContainer.innerHTML = `
          <div class="no-results">
            <p>Error loading listings: ${error.message}</p>
            <p>Please try again or try a different search.</p>
          </div>
        `;
      }
    });
  }
  
  /**
   * Display the current page of listings
   */
  function displayCurrentPage(page, itemsPerPage) {
    const listingsContainer = document.getElementById('listingsContainer');
    if (!listingsContainer) {
      console.log('No listings container found');
      return;
    }
    
    // Calculate which listings to show for this page
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allSortedListings.length);
    const pageListings = allSortedListings.slice(startIndex, endIndex);
    
    console.log(`Displaying listings from ${startIndex + 1} to ${endIndex} (page ${page})`);
    
    // Clear existing listings
    listingsContainer.innerHTML = '';
    
    // Check if we have any profitable listings
    const profitableListings = pageListings.filter(listing => parseFloat(listing.profit) > 0);
    console.log(`Found ${profitableListings.length} profitable listings on this page`);
    
    if (profitableListings.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.innerHTML = '<p>No profitable listings found. Try a different search term, zipcode, or budget.</p>';
      listingsContainer.appendChild(noResults);
      
      // Update status info
      const statusInfo = document.querySelector('.status-info strong');
      if (statusInfo) {
        statusInfo.textContent = '0';
      }
      
      return;
    }
    
    // Create HTML for each listing
    profitableListings.forEach((listing, index) => {
      const absoluteIndex = startIndex + index;
      const hasProfit = parseFloat(listing.profit) > 0;
      
      // Skip non-profitable listings
      if (!hasProfit) return;
      
      // Calculate profit class
      const profitClass = hasProfit ? 'has-profit' : 'no-profit';
      const profitRowClass = hasProfit ? 'positive-profit' : 'negative-profit';
      
      // Create listing element
      const listingElement = document.createElement('div');
      listingElement.className = `listing ${hasProfit ? 'has-profit-listing' : 'no-profit-listing'}`;
      listingElement.id = listing.id;
      listingElement.setAttribute('data-profit', listing.profit);
      
      // Calculate sale time class
      let saleTimeClass = 'sale-time-slow';
      if (listing.avgSaleTime <= 3) {
        saleTimeClass = 'sale-time-fast';
      } else if (listing.avgSaleTime <= 7) {
        saleTimeClass = 'sale-time-medium';
      }
      
      // Set inner HTML with listing details
      listingElement.innerHTML = `
        <div class="profit-container ${profitClass}">
          <div class="profit-indicator">
            <span class="rank-badge">#${absoluteIndex + 1}</span>
            <strong>Profit Potential:</strong> 
            <span class="profit-value-display">
              <span class="profit-value-container" data-id="${listing.id}-indicator">
                ${hasProfit ? 
                  `<span class="profit-value">${listing.profit}</span>` : 
                  `<span class="no-profit-value">No Profit</span>`
                }
              </span>
            </span>
          </div>
        </div>
        <div class="listing-content">
          <a href="${listing.link}" target="_blank" class="title">${listing.title}</a>
          <div class="price-comparison" data-id="${listing.id}" data-title="${listing.title}" data-price="${listing.price}">
            <div class="price-row">
              <span class="price-label">Craigslist Price:</span>
              <span class="price">${listing.price}</span>
            </div>
            <div class="price-row">
              <span class="price-label">eBay Resale Value:</span>
              <span class="resale-price">$<span class="resale-value">${listing.resaleValue}</span></span>
            </div>
            <div class="price-row profit-row ${profitRowClass}">
              <span class="price-label">Potential Profit:</span>
              <span class="profit-amount">$<span class="profit-value">${listing.profit}</span></span>
            </div>
            <div class="sale-time-row">
              <span class="price-label">Avg. Sale Time:</span>
              <span class="avg-sale-time ${saleTimeClass}">${listing.avgSaleTime} days</span>
            </div>
          </div>
          ${listing.location ? `
            <div class="info-row">
              <span class="location">${listing.location}</span>
              <a href="https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(listing.title.split('-')[0].trim())}&LH_Sold=1" target="_blank" class="ebay-link">Check on eBay</a>
            </div>
          ` : ''}
        </div>
      `;
      
      // Add the listing to the container
      listingsContainer.appendChild(listingElement);
    });
    
    // Update the status info
    const statusInfo = document.querySelector('.status-info strong');
    if (statusInfo) {
      const totalProfitable = allSortedListings.filter(listing => parseFloat(listing.profit) > 0).length;
      statusInfo.textContent = totalProfitable;
    }
    
    // Update the rank info
    const rankInfo = document.querySelector('.rank-info');
    if (rankInfo) {
      rankInfo.textContent = 'Showing only profitable listings, ranked by highest profit potential';
      rankInfo.style.fontWeight = 'bold';
      rankInfo.style.color = '#27ae60';
    }
    
    // Make sure all listings are visible
    const listingElements = document.querySelectorAll('.listing');
    listingElements.forEach(elem => {
      elem.style.opacity = '1';
      elem.style.visibility = 'visible';
      elem.classList.add('loaded');
      elem.classList.add('fade-in');
      elem.classList.remove('initially-hidden');
    });
  }
  
  /**
   * Update pagination info
   */
  function updatePageInfo(currentPage, itemsPerPage, totalListings) {
    // Calculate total pages based on profitable listings only
    const profitableListings = allSortedListings.filter(listing => parseFloat(listing.profit) > 0);
    const totalPages = Math.ceil(profitableListings.length / itemsPerPage) || 1;
    
    // Update page info text
    const pageInfoElements = document.querySelectorAll('.page-info');
    pageInfoElements.forEach(element => {
      element.textContent = `Page ${currentPage} of ${totalPages}`;
    });
    
    // Update pagination buttons
    updatePaginationButtons(currentPage, totalPages);
  }
  
  /**
   * Update pagination buttons visibility and active state
   */
  function updatePaginationButtons(currentPage, totalPages) {
    // Get both top and bottom pagination controls
    ['Top', 'Bottom'].forEach(position => {
      const paginationControl = document.getElementById(`pagination${position}`);
      if (!paginationControl) return;
      
      // Only show pagination if we have more than one page
      if (totalPages <= 1) {
        paginationControl.style.display = 'none';
        return;
      }
      
      paginationControl.style.display = 'flex';
      
      // Get buttons container
      const buttonsContainer = paginationControl.querySelector('.page-buttons');
      if (!buttonsContainer) return;
      
      // Clear existing buttons
      buttonsContainer.innerHTML = '';
      
      // Add first and previous buttons if not on first page
      if (currentPage > 1) {
        buttonsContainer.innerHTML += `
          <button class="page-button" data-page="1">First</button>
          <button class="page-button" data-page="${currentPage - 1}">Previous</button>
        `;
      }
      
      // Show up to 5 page numbers, centered around current page
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, startPage + 4);
      if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        buttonsContainer.innerHTML += `
          <button class="page-button ${i === currentPage ? 'active-page' : ''}" data-page="${i}">${i}</button>
        `;
      }
      
      // Add next and last buttons if not on last page
      if (currentPage < totalPages) {
        buttonsContainer.innerHTML += `
          <button class="page-button" data-page="${currentPage + 1}">Next</button>
          <button class="page-button" data-page="${totalPages}">Last</button>
        `;
      }
      
      // Add click handlers for the new buttons
      const pageButtons = buttonsContainer.querySelectorAll('.page-button');
      pageButtons.forEach(button => {
        button.addEventListener('click', function(e) {
          e.preventDefault();
          const page = parseInt(this.getAttribute('data-page'));
          if (page) {
            // Update URL to reflect the page change
            const url = new URL(window.location);
            url.searchParams.set('page', page);
            window.history.pushState({}, '', url);
            
            // Display the selected page
            displayCurrentPage(page, itemsPerPage);
            
            // Update pagination info
            updatePageInfo(page, itemsPerPage, allSortedListings.length);
            
            // Scroll to top
            window.scrollTo(0, 0);
          }
        });
      });
    });
  }
  
  /**
   * Process listings one by one sequentially
   */
  function processListingsSequentially(listings, index) {
    if (index >= listings.length) {
      console.log('All listings processed');
      // Show only profitable listings and sort them
      setTimeout(() => {
        showProfitableListings();
        hideLoadingOverlay();
      }, 500);
      
      // Force listings to be visible temporarily so they get processed
      const listingElements = document.querySelectorAll('.listing');
      console.log(`Making ${listingElements.length} listings visible for processing`);
      listingElements.forEach(elem => {
        elem.style.opacity = '1';
        elem.style.visibility = 'visible';
        elem.classList.add('loaded');
        elem.classList.add('fade-in');
        elem.classList.remove('initially-hidden');
      });
      
      return;
    }
    
    const listing = listings[index];
    const title = listing.getAttribute('data-title');
    const price = listing.getAttribute('data-price');
    
    console.log(`Processing listing ${index + 1}/${listings.length}: ${title}`);
    
    // Show loading indicator for this listing
    const loadingIndicator = listing.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'inline-block';
    }
    
    // Make sure the parent listing element is ready to show
    const listingElem = listing.closest('.listing');
    if (listingElem) {
      listingElem.classList.add('loaded');
    }
    
    // Fetch eBay data for this listing
    fetch('/api/getEbayData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, price })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      updateListingWithData(listing, data);
      
      // Move to the next listing with a small delay
      setTimeout(() => {
        processListingsSequentially(listings, index + 1);
      }, 50);
    })
    .catch(error => {
      console.error(`Error fetching data for ${title}:`, error);
      
      // Hide loading indicator
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
      
      // Continue with next listing despite error
      setTimeout(() => {
        processListingsSequentially(listings, index + 1);
      }, 50);
    });
  }
  
  /**
   * Update a listing with the data from the API
   */
  function updateListingWithData(listing, data) {
    // Find all related elements
    const listingElem = listing.closest('.listing');
    const resaleValueElem = listing.querySelector('.resale-value');
    const profitValueElem = listing.querySelector('.profit-value');
    const saleTimeElem = listing.querySelector('.avg-sale-time');
    const loadingIndicator = listing.querySelector('.loading-indicator');
    const profitContainer = listingElem?.querySelector('.profit-container');
    const profitRow = listing.querySelector('.profit-row');
    
    // Parse the profit as a number
    const profitValue = parseFloat(data.profit) || 0;
    
    // Update resale value
    if (resaleValueElem) {
      resaleValueElem.textContent = data.resaleValue;
    }
    
    // Update profit value
    if (profitValueElem) {
      profitValueElem.textContent = profitValue.toString();
    }
    
    // Update average sale time
    if (saleTimeElem && data.avgSaleTime) {
      const saleTime = data.avgSaleTime;
      let saleTimeClass = 'sale-time-slow';
      
      if (saleTime <= 3) {
        saleTimeClass = 'sale-time-fast';
      } else if (saleTime <= 7) {
        saleTimeClass = 'sale-time-medium';
      }
      
      saleTimeElem.textContent = `${saleTime} days`;
      saleTimeElem.className = `avg-sale-time ${saleTimeClass}`;
    }
    
    // Hide loading indicator
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    
    // Check if this listing has a profit
    const hasProfit = profitValue > 0;
    
    if (listingElem) {
      // Update the profit indicator at the top
      const profitValueContainer = listingElem.querySelector('.profit-value-container');
      if (profitValueContainer) {
        profitValueContainer.innerHTML = hasProfit ? 
          `<span class="profit-value">${profitValue}</span>` : 
          `<span class="no-profit-value">No Profit</span>`;
      }
      
      // Set data attribute for easier sorting
      listingElem.setAttribute('data-profit', profitValue.toString());
      
      // Mark the listing accordingly
      if (hasProfit) {
        listingElem.classList.add('has-profit-listing');
        listingElem.classList.remove('no-profit-listing');
      } else {
        listingElem.classList.add('no-profit-listing');
        listingElem.classList.remove('has-profit-listing');
      }
    }
    
    // Update container classes
    if (hasProfit) {
      if (profitContainer) {
        profitContainer.classList.add('has-profit');
        profitContainer.classList.remove('no-profit');
      }
      if (profitRow) {
        profitRow.classList.add('positive-profit');
        profitRow.classList.remove('negative-profit');
      }
      
      // Make sure the profit value is formatted correctly
      const profitAmount = listing.querySelector('.profit-amount');
      if (profitAmount) {
        profitAmount.innerHTML = `$<span class="profit-value">${profitValue}</span>`;
      }
    } else {
      if (profitContainer) {
        profitContainer.classList.add('no-profit');
        profitContainer.classList.remove('has-profit');
      }
      if (profitRow) {
        profitRow.classList.add('negative-profit');
        profitRow.classList.remove('positive-profit');
      }
      
      // Make sure the no-profit listing is clearly marked
      if (listingElem) {
        listingElem.setAttribute('data-hide-after-loading', 'true');
      }
    }
  }
  
  /**
   * Show only profitable listings and sort them
   */
  function showProfitableListings() {
    const listingsContainer = document.getElementById('listingsContainer');
    if (!listingsContainer) {
      console.log('No listings container found');
      return;
    }
    
    console.log('Displaying profitable listings...');
    
    // Get all listings
    const allListings = Array.from(listingsContainer.querySelectorAll('.listing'));
    console.log('Total listings found in DOM:', allListings.length);
    
    // First make all listings visible to ensure they're properly loaded
    allListings.forEach(listing => {
      listing.classList.remove('initially-hidden');
      listing.style.opacity = '1';
      listing.style.visibility = 'visible';
      listing.style.display = 'block';
      listing.classList.add('loaded');
      listing.classList.add('fade-in');
    });
    
    // Filter to only profitable listings
    const profitableListings = allListings.filter(listing => {
      const profitValueContainer = listing.querySelector('.profit-value-container');
      const profitValue = listing.querySelector('.profit-value');
      let profit = 0;
      
      if (profitValue) {
        profit = parseFloat(profitValue.textContent || '0');
      } else if (profitValueContainer && profitValueContainer.textContent.includes('$')) {
        // Try to extract profit value from container if available
        const match = profitValueContainer.textContent.match(/\$([0-9.]+)/);
        profit = match ? parseFloat(match[1]) : 0;
      }
      
      console.log(`Listing ${listing.id || 'unknown'}: profit = ${profit}`);
      return profit > 0;
    });
    
    console.log(`Found ${profitableListings.length} profitable listings out of ${allListings.length} total`);
    
    // Update total count in status info
    const statusInfo = document.querySelector('.status-info strong');
    if (statusInfo) {
      statusInfo.textContent = profitableListings.length;
    }
    
    // Show only profitable listings - no longer in development mode
    const showAllListings = false; // Now we're filtering to show only profitable listings
    
    if (showAllListings) {
      console.log("IMPORTANT: Showing ALL listings for development purposes");
      
      // Just make sure ALL listings are visible and keep them that way
      allListings.forEach((listing) => {
        listing.classList.remove('initially-hidden');
        listing.classList.add('loaded');
        listing.classList.add('fade-in');
        listing.style.opacity = '1';
        listing.style.visibility = 'visible';
        listing.style.display = 'block';
      });
      
      // Update the status info
      if (statusInfo) {
        statusInfo.textContent = allListings.length;
      }
      
      return; // Skip the rest of the filtering logic
    }
    
    // If no profitable listings, show message
    if (profitableListings.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'no-results';
      noResults.innerHTML = '<p>No profitable listings found. Try a different search term, zipcode, or budget.</p>';
      
      // Clear container and add message
      while (listingsContainer.firstChild) {
        listingsContainer.removeChild(listingsContainer.firstChild);
      }
      
      listingsContainer.appendChild(noResults);
      
      // Hide pagination if present
      const paginationControls = document.querySelectorAll('.pagination-controls');
      paginationControls.forEach(control => {
        control.style.display = 'none';
      });
      
      return;
    }
    
    // Sort profitable listings by profit (highest to lowest)
    profitableListings.sort((a, b) => {
      const profitValueA = a.querySelector('.profit-value');
      const profitValueB = b.querySelector('.profit-value');
      
      const profitA = profitValueA ? parseFloat(profitValueA.textContent || '0') : 0;
      const profitB = profitValueB ? parseFloat(profitValueB.textContent || '0') : 0;
      
      return profitB - profitA; // Sort highest profit first
    });
    
    console.log("Sorting profitable listings - highest profit first");
    
    // Remove all listings from container first
    while (listingsContainer.firstChild) {
      listingsContainer.removeChild(listingsContainer.firstChild);
    }
    
    // Re-add sorted profitable listings to the container
    profitableListings.forEach((listing, index) => {
      // Update the rank badge
      const rankBadge = listing.querySelector('.rank-badge');
      if (rankBadge) {
        rankBadge.textContent = `#${index + 1}`;
      }
      
      // Make sure profitable listings remain fully visible
      listing.style.display = 'block';
      listing.style.opacity = '1';
      listing.style.visibility = 'visible';
      listing.classList.add('loaded');
      listing.classList.add('fade-in');
      
      // Add the listing back to the container in sorted order
      listingsContainer.appendChild(listing);
    });
    
    // Update the status info
    const rankInfo = document.querySelector('.rank-info');
    if (rankInfo) {
      rankInfo.textContent = 'Showing only profitable listings, ranked by highest profit potential';
      rankInfo.style.fontWeight = 'bold';
      rankInfo.style.color = '#27ae60';
    }
    
    // Hide any non-profitable listings that might have been missed
    allListings.forEach(listing => {
      if (!profitableListings.includes(listing) && listing.parentNode) {
        listing.parentNode.removeChild(listing);
      }
    });
    
    console.log(`Successfully displayed ${profitableListings.length} profitable listings in sorted order`);
  }
  
  /**
   * Setup pagination functionality
   */
  function setupPagination() {
    // If using sorted backend, we'll handle pagination differently
    if (useSortedBackend) {
      // Initial setup only - actual buttons will be generated when data loads
      const itemsPerPageSelect = document.getElementById('itemsPerPage');
      if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', function() {
          const newItemsPerPage = parseInt(this.value);
          
          // Update the URL
          const url = new URL(window.location);
          url.searchParams.set('itemsPerPage', newItemsPerPage);
          url.searchParams.set('page', '1'); // Reset to page 1
          window.history.pushState({}, '', url);
          
          // Redisplay with new items per page setting
          if (allSortedListings && allSortedListings.length > 0) {
            displayCurrentPage(1, newItemsPerPage);
            updatePageInfo(1, newItemsPerPage, allSortedListings.length);
          } else {
            // If no listings loaded yet, reload the page
            window.location.href = url.toString();
          }
        });
      }
      
      return; // Skip the old pagination setup
    }
    
    // Legacy pagination for non-sorted backend
    // Add click handlers to all page buttons
    const pageButtons = document.querySelectorAll('.page-button');
    pageButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.preventDefault();
        const page = this.getAttribute('data-page');
        if (page) {
          // Update hidden page input and submit form
          document.getElementById('currentPageInput').value = page;
          document.getElementById('searchForm').submit();
        }
      });
    });
    
    // Handle items per page selection
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    if (itemsPerPageSelect) {
      itemsPerPageSelect.addEventListener('change', function() {
        // Create or update a hidden input for items per page
        let input = document.querySelector('input[name="itemsPerPage"]');
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'itemsPerPage';
          document.getElementById('searchForm').appendChild(input);
        }
        
        input.value = this.value;
        document.getElementById('currentPageInput').value = '1'; // Reset to page 1
        document.getElementById('searchForm').submit();
      });
    }
  }
  
  /**
   * Setup form submission to include isSearchButtonPressed
   */
  function setupFormSubmission() {
    const searchForm = document.getElementById('searchForm');
    const searchButton = document.getElementById('searchButton');
    
    if (searchForm && searchButton) {
      searchButton.addEventListener('click', function() {
        // Set search button pressed flag
        const input = document.querySelector('input[name="isSearchButtonPressed"]');
        if (input) {
          input.value = 'true';
        }
        
        // Store search button pressed state in session storage
        sessionStorage.setItem('searchButtonPressed', 'true');
        
        // Reset to page 1 when searching with new criteria
        document.getElementById('currentPageInput').value = '1';
        
        // Show loading overlay immediately
        showLoadingOverlay();
      });
      
      // Also handle the form submission event
      searchForm.addEventListener('submit', function() {
        // Make sure search button pressed flag is set
        const input = document.querySelector('input[name="isSearchButtonPressed"]');
        if (input) {
          input.value = 'true';
        }
        
        // Show loading overlay
        showLoadingOverlay();
      });
    }
  }
});
