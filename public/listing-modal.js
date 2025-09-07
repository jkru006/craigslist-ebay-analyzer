// Listing modal functionality
document.addEventListener('DOMContentLoaded', function() {
  // Create modal container if it doesn't exist
  if (!document.getElementById('listingDetailModal')) {
    const modalContainer = document.createElement('div');
    modalContainer.id = 'listingDetailModal';
    modalContainer.className = 'listing-modal';
    modalContainer.innerHTML = `
      <div class="modal-content">
        <span class="close-modal">&times;</span>
        <div id="modalContent" class="modal-body">Loading...</div>
      </div>
    `;
    document.body.appendChild(modalContainer);

    // Add close button functionality
    const closeButton = modalContainer.querySelector('.close-modal');
    closeButton.addEventListener('click', function() {
      closeListingModal();
    });

    // Close when clicking outside the modal content
    modalContainer.addEventListener('click', function(e) {
      if (e.target === modalContainer) {
        closeListingModal();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeListingModal();
      }
    });
  }

  // Intercept clicks on listing titles or entire listing cards
  document.addEventListener('click', function(e) {
    // Check if clicked within a listing
    const listingCard = e.target.closest('.listing');
    if (listingCard) {
      // Find the title link within this listing
      const titleLink = listingCard.querySelector('.title');
      
      // Skip if clicking on another link within the listing or if title link isn't found
      if (e.target.tagName === 'A' && e.target !== titleLink) {
        return;
      }
      
      if (titleLink && titleLink.href && titleLink.href.includes('/listing/')) {
        e.preventDefault();
        
        // Extract listing ID and URL from the href
        const url = new URL(titleLink.href);
        const listingId = url.pathname.split('/').pop();
        const listingUrl = url.searchParams.get('url');
        
        // Show modal and load content
        openListingModal(listingId, listingUrl);
      }
    }
  });
});

// Cache for listing details to speed up repeated viewing
const listingCache = {};

// Function to open listing modal
function openListingModal(listingId, listingUrl) {
  const modal = document.getElementById('listingDetailModal');
  const modalContent = document.getElementById('modalContent');
  
  // Show modal and loading state
  modal.style.display = 'block';
  modalContent.innerHTML = '<div class="loading-spinner"></div><p>Loading listing details...</p>';
  
  // First, check if we can get profit data from the main listing cards
  let existingResaleValue = null;
  let existingProfit = null;
  let existingAvgSaleTime = null;
  
  try {
    // Look for profit data in the listing card
    const listingCard = document.querySelector(`.listing[data-id="${listingId}"]`);
    if (listingCard) {
      const resaleValueElem = listingCard.querySelector('.resale-value');
      const profitValueElem = listingCard.querySelector('.profit-value');
      const saleTimeElem = listingCard.querySelector('.sale-time-value');
      
      if (resaleValueElem) existingResaleValue = resaleValueElem.textContent.trim().replace('$', '');
      if (profitValueElem) existingProfit = profitValueElem.textContent.trim().replace('$', '');
      if (saleTimeElem) existingAvgSaleTime = parseInt(saleTimeElem.textContent.trim(), 10);
      
      console.log(`Found existing data for listing ${listingId}: resale=${existingResaleValue}, profit=${existingProfit}, time=${existingAvgSaleTime}`);
    }
  } catch (e) {
    console.error('Error finding existing listing data:', e);
  }
  
  // Use cache if available to speed up loading
  const cacheKey = `${listingId}-${listingUrl}`;
  if (listingCache[cacheKey]) {
    console.log('Using cached listing data');
    
    // Merge with existing data from listing cards if available
    const cachedData = listingCache[cacheKey];
    if (existingResaleValue && (!cachedData.resaleValue || cachedData.resaleValue === '0' || cachedData.resaleValue === '0.00')) {
      cachedData.resaleValue = existingResaleValue;
    }
    if (existingProfit && (!cachedData.profit || cachedData.profit === '0' || cachedData.profit === '0.00')) {
      cachedData.profit = existingProfit;
    }
    if (existingAvgSaleTime && (!cachedData.avgSaleTime || cachedData.avgSaleTime === 0)) {
      cachedData.avgSaleTime = existingAvgSaleTime;
    }
    
    setTimeout(() => {
      displayListingDetails(cachedData);
    }, 50); // Small timeout to allow spinner to show
    return;
  }
  
  // Function to fetch listing details with retry capability
  function fetchListingWithRetry(attempt = 1, maxAttempts = 3) {
    console.log(`Fetching listing details, attempt ${attempt} of ${maxAttempts}`);
    
    // Create an AbortController to timeout fetch after 8 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    // Fetch listing details with timeout
    fetch(`/api/listing-details?id=${encodeURIComponent(listingId)}&url=${encodeURIComponent(listingUrl)}`, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
      .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        // Check if eBay data and profit are available
        const hasValidEbayData = data.resaleValue && 
                               data.resaleValue !== '0' && 
                               data.resaleValue !== '0.00' && 
                               data.profit && 
                               data.profit !== '0' && 
                               data.profit !== '0.00';
                               
        // If we don't have valid eBay data and we haven't exceeded max attempts, retry
        if (!hasValidEbayData && attempt < maxAttempts) {
          console.log(`Missing eBay data, retrying (attempt ${attempt} of ${maxAttempts})`);
          // Exponential backoff - wait longer between each retry
          setTimeout(() => fetchListingWithRetry(attempt + 1, maxAttempts), attempt * 1000);
          return;
        }
        
        // Merge with existing data from listing cards if available
        if (existingResaleValue && (!data.resaleValue || data.resaleValue === '0' || data.resaleValue === '0.00')) {
          data.resaleValue = existingResaleValue;
        }
        if (existingProfit && (!data.profit || data.profit === '0' || data.profit === '0.00')) {
          data.profit = existingProfit;
        }
        if (existingAvgSaleTime && (!data.avgSaleTime || data.avgSaleTime === 0)) {
          data.avgSaleTime = existingAvgSaleTime;
        }
        
        // Cache the result for future use
        listingCache[cacheKey] = data;
        displayListingDetails(data);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        console.error(`Error fetching listing details (attempt ${attempt}):`, error);
        
        // If we haven't exceeded max attempts, retry
        if (attempt < maxAttempts) {
          console.log(`Retrying due to error (attempt ${attempt} of ${maxAttempts})`);
          // Exponential backoff - wait longer between each retry
          setTimeout(() => fetchListingWithRetry(attempt + 1, maxAttempts), attempt * 1000);
        } else {
          console.error('Max retry attempts reached, giving up.');
          
          // If we have any existing data, we can try to display something
          if (existingResaleValue || existingProfit) {
            const partialData = {
              id: listingId,
              url: listingUrl,
              title: document.querySelector(`.listing[data-id="${listingId}"] .title`)?.textContent.trim() || 'Item Details',
              price: document.querySelector(`.listing[data-id="${listingId}"] .price`)?.textContent.trim() || 'Price unavailable',
              description: 'Description unavailable. Please check the original listing.',
              resaleValue: existingResaleValue || '0.00',
              profit: existingProfit || '0.00',
              avgSaleTime: existingAvgSaleTime || 0,
              hasProfit: existingProfit && parseFloat(existingProfit) > 0
            };
            displayListingDetails(partialData);
          } else {
            // Show error message in modal
            modalContent.innerHTML = `
              <div class="error-message">
                <h3>Error loading listing details</h3>
                <p>${error.message}</p>
                <p>Please try again or view the <a href="${listingUrl}" target="_blank">original listing</a>.</p>
              </div>
            `;
          }
        }
      });
  }
  
  // Start the fetch process with retries
  fetchListingWithRetry();
}

// Function to close the modal
function closeListingModal() {
  const modal = document.getElementById('listingDetailModal');
  modal.style.display = 'none';
}

// Function to preload images and track their load status
function preloadImages(images) {
  return new Promise(resolve => {
    if (!images || images.length === 0) {
      resolve([]);
      return;
    }
    
    // Filter out invalid images
    const safeImages = images.filter(img => img && typeof img === 'string');
    if (safeImages.length === 0) {
      resolve([]);
      return;
    }
    
    let loadedCount = 0;
    const imageStatuses = safeImages.map(() => false);
    const preloadedImages = [];
    
    // Set a timeout to resolve after 5 seconds even if not all images load
    const timeoutId = setTimeout(() => {
      console.log('Image preloading timed out, continuing with what we have');
      resolve(preloadedImages);
    }, 5000);
    
    // Preload each image
    safeImages.forEach((src, index) => {
      const img = new Image();
      
      img.onload = () => {
        imageStatuses[index] = true;
        preloadedImages.push(src);
        loadedCount++;
        
        // If all images are loaded or attempted, resolve the promise
        if (loadedCount === safeImages.length) {
          clearTimeout(timeoutId);
          resolve(preloadedImages);
        }
      };
      
      img.onerror = () => {
        console.log(`Failed to load image: ${src}`);
        loadedCount++;
        
        // If all images are loaded or attempted, resolve the promise
        if (loadedCount === safeImages.length) {
          clearTimeout(timeoutId);
          resolve(preloadedImages);
        }
      };
      
      // Start loading the image
      img.src = src;
    });
  });
}

// Function to clean up description text
function cleanDescription(description) {
  if (!description) return 'No description available';
  
  // Check if description is actually the listing title and price (common error case)
  if (typeof description === 'string') {
    // Specific check for MacBook Pro listings with title/price as description
    if (description.includes('MacBook Pro') && description.includes('Laptop') && 
        (description.includes('Like New') || description.includes('Excellent Condition')) &&
        description.includes('$')) {
      return 'No detailed description available. Please check the original listing for more information.';
    }
    
    // General check for title/price as description
    if (description.includes('Laptop') && description.includes('$') && 
        (description.includes('Like New') || description.includes('Excellent Condition')) &&
        description.length < 200) {
      return 'No detailed description available. Please check the original listing for more information.';
    }
  }
  
  // Convert HTML to plain text if it contains HTML
  let cleanText = description;
  
  // If it's HTML, preserve some basic formatting but remove scripts and unwanted elements
  if (typeof cleanText === 'string' && cleanText.includes('<')) {
    try {
      // Create a temporary div to parse HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanText;
      
      // Remove any script tags for security
      const scripts = tempDiv.querySelectorAll('script');
      scripts.forEach(script => script.remove());
      
      // Remove empty paragraphs and break tags at the beginning
      const emptyElements = tempDiv.querySelectorAll('p:empty, br:first-child');
      emptyElements.forEach(el => el.remove());
      
      // Keep the innerHTML to preserve basic formatting like <br> tags
      cleanText = tempDiv.innerHTML;
    } catch (e) {
      console.error('Error parsing HTML description', e);
      // If error, fallback to plain text
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanText;
      cleanText = tempDiv.textContent || tempDiv.innerText || '';
    }
  }
  
  // Remove QR Code message and surrounding blank lines
  cleanText = cleanText.replace(/\s*QR Code Link to This Post\s*/gi, '');
  
  // More aggressive cleaning of HTML line breaks and empty paragraphs
  cleanText = cleanText.replace(/<p>\s*<\/p>/gi, '');
  cleanText = cleanText.replace(/<p>\s*&nbsp;\s*<\/p>/gi, '');
  cleanText = cleanText.replace(/<p[^>]*>\s*<\/p>/gi, '');
  
  // Replace multiple blank lines with single blank line
  cleanText = cleanText.replace(/(\n\s*\n\s*\n)+/g, '\n\n');
  cleanText = cleanText.replace(/(<br>\s*<br>\s*<br>)+/gi, '<br><br>');
  cleanText = cleanText.replace(/(<br>\s*)+(\n\s*)+/gi, '<br>');
  
  // Remove leading blank lines and whitespace even more aggressively
  cleanText = cleanText.replace(/^(\s*<br\s*\/?>\s*)+/i, '');
  cleanText = cleanText.replace(/^(\s*\n\s*)+/, '');
  cleanText = cleanText.replace(/^(\s*&nbsp;\s*)+/i, '');
  
  // Delete the first 4 lines of the description if they contain any blank characters
  if (typeof cleanText === 'string') {
    // Split into lines
    const lines = cleanText.split('\n');
    
    // Check if we have at least 5 lines (4 to remove + at least 1 to keep)
    if (lines.length >= 5) {
      // Check if first 4 lines contain blank characters
      const firstFourLinesHaveBlank = lines.slice(0, 4).every(line => /\s/.test(line));
      
      // If all first 4 lines have blank characters, remove them
      if (firstFourLinesHaveBlank) {
        cleanText = lines.slice(4).join('\n');
      }
    }
  }
  
  // Trim extra whitespace
  cleanText = cleanText.trim();
  
  // If after cleaning we have an empty string, provide a default message
  if (!cleanText || cleanText === '&nbsp;') {
    return 'No detailed description available. Please check the original listing for more information.';
  }
  
  return cleanText;
}

// Function to display listing details in the modal
function displayListingDetails(listing) {
  const modalContent = document.getElementById('modalContent');
  
  // Make sure listing object has all required properties
  if (!listing) listing = {};
  
  // Default values for missing properties
  const price = listing.price || '$0.00';
  
  // Ensure resale values are properly set to avoid undefined or null
  // Use fallback values for blank/missing data
  const resaleValue = (listing.resaleValue && listing.resaleValue !== '0' && listing.resaleValue !== '0.00') 
    ? listing.resaleValue 
    : '---';
    
  const profit = (listing.profit && listing.profit !== '0' && listing.profit !== '0.00')
    ? listing.profit
    : '---';
    
  const avgSaleTime = (listing.avgSaleTime && listing.avgSaleTime > 0)
    ? listing.avgSaleTime
    : '---';
  
  // Create HTML for profit info with proper display handling
  const profitClass = (profit && profit !== '---' && parseFloat(profit) > 0) ? 'positive-profit' : 'negative-profit';
  const saleTimeClass = (avgSaleTime && avgSaleTime !== '---')
    ? (avgSaleTime <= 3 ? 'sale-time-fast' : 
      (avgSaleTime <= 7 ? 'sale-time-medium' : 'sale-time-slow'))
    : '';

  // Clean up the description
  const cleanedDescription = cleanDescription(listing.description);
  
  // Start preloading images immediately - with improved error handling
  let imagePreloadPromise;
  if (listing.images && listing.images.length > 0) {
    // Only preload the first image
    const safeImages = listing.images.filter(img => img && typeof img === 'string');
    if (safeImages.length > 0) {
      imagePreloadPromise = preloadImages([safeImages[0]]);
    } else {
      imagePreloadPromise = Promise.resolve([]);
    }
  } else {
    imagePreloadPromise = Promise.resolve([]);
  }

  // Create HTML for image gallery - only first image
  let imagesHtml = '';
  if (listing.images && listing.images.length > 0) {
    // Ensure we're loading only the first image properly
    const safeImages = listing.images.filter(img => img && typeof img === 'string');
    
    if (safeImages.length === 0) {
      // No valid images, show placeholder
      imagesHtml = `
        <div class="detail-section image-section">
          <div class="main-image-container">
            <img src="/placeholder.png" alt="No image available" class="main-image" style="opacity: 1">
            <div class="no-images-message">No images available</div>
          </div>
        </div>
      `;
    } else {
      // Load only the first image
      const firstImage = safeImages[0];
      
      imagesHtml = `
        <div class="detail-section image-section">
          <div class="main-image-container">
            <img src="${firstImage}?main=true" 
                 alt="${listing.title}" 
                 class="main-image" 
                 id="mainImage" 
                 onload="this.style.opacity=1"
                 onerror="this.src='/placeholder.png'; this.style.opacity=1">
          </div>
        </div>
      `;
    }
  } else {
    // No images array or empty array
    imagesHtml = `
      <div class="detail-section image-section">
        <div class="main-image-container">
          <img src="/placeholder.png" alt="No image available" class="main-image" style="opacity: 1">
          <div class="no-images-message">No images available</div>
        </div>
      </div>
    `;
  }

  // Remove Google Maps and attributes section
  let mapHtml = ''; // No maps
  let attributesHtml = ''; // No attributes

  // Build complete HTML for the modal
  const html = `
    <div class="detail-container">
      <div class="resale-info">
        <h2>Resale Analysis</h2>
        <div class="profit-info">
          <div class="profit-item">
            <h4>Craigslist Price</h4>
            <div class="profit-value">${price}</div>
          </div>
          
          <div class="profit-item">
            <h4>eBay Resale Value</h4>
            <div class="profit-value">${resaleValue === '---' ? 'Not available' : '$' + resaleValue}</div>
          </div>
          
          <div class="profit-item ${profitClass}">
            <h4>Potential Profit</h4>
            <div class="profit-value">${profit === '---' ? 'Not available' : '$' + profit}</div>
          </div>
          
          <div class="profit-item">
            <h4>Avg. Sale Time</h4>
            <div class="profit-value ${saleTimeClass}">
              ${avgSaleTime === '---' ? 'Unknown' : avgSaleTime + ' days'}
            </div>
          </div>
        </div>
      </div>

      <div class="detail-content-wrapper">
        <div class="detail-left-column">
          ${imagesHtml}
        </div>
        
        <div class="detail-right-column">
          <div class="detail-header">
            <div class="detail-title">
              <h1>${listing.title}</h1>
              <div class="detail-price">${listing.price}</div>
              <p class="posted-info">Posted: ${listing.postedDate || 'Not specified'}</p>
            </div>
          </div>
          
          <div class="action-buttons">
            <button class="action-button buy-button" onclick="alert('Buy feature coming soon!')">Buy Now</button>
            <a href="${listing.url}" target="_blank" class="action-button original-button">View Original</a>
            <a href="https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(listing.title.split('-')[0].trim())}&LH_Sold=1" target="_blank" class="action-button ebay-button">Check on eBay</a>
          </div>
        </div>
      </div>
      
      <div class="detail-section">
        <h3>Description</h3>
        <div class="description description-scrollable">${cleanedDescription}</div>
      </div>
    </div>
    
    <!-- Image Modal -->
    <div id="imageModal" class="image-modal">
      <span class="close-modal" onclick="closeImageModal()">&times;</span>
      <img class="modal-content" id="modalImg">
    </div>
    
    <script>
      // Image modal functionality
      function openImageModal(src) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImg');
        modal.style.display = "block";
        modalImg.src = src;
      }
      
      function closeImageModal() {
        document.getElementById('imageModal').style.display = "none";
      }
      
      // Close modal when clicking outside the image
      window.onclick = function(event) {
        const modal = document.getElementById('imageModal');
        if (event.target == modal) {
          closeImageModal();
        }
      }
      
      // Wait for image preloading to finish, then update the loading indicator
      if (typeof imagePreloadPromise !== 'undefined') {
        imagePreloadPromise.then(preloadedImages => {
          // Remove loading indicator
          const loadingIndicator = document.querySelector('.image-loading-indicator');
          if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
          }
          
          // Update gallery images to show they're loaded
          const galleryImages = document.querySelectorAll('.gallery-image');
          if (galleryImages.length > 0) {
            galleryImages.forEach(img => {
              if (preloadedImages.includes(img.getAttribute('data-src'))) {
                img.classList.add('loaded');
              }
            });
          }
        });
      }
    </script>
  `;
  
  modalContent.innerHTML = html;
}
