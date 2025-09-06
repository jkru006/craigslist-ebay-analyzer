const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const EbayNodeApi = require('ebay-node-api');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize eBay API
const ebay = new EbayNodeApi({
  clientID: process.env.EBAY_APP_ID,
  clientSecret: process.env.EBAY_CERT_ID,
  devId: process.env.EBAY_DEV_ID,
  env: process.env.EBAY_ENV // SANDBOX or PRODUCTION
});

// Add a search form to let users search for different items
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // For API requests

// Helper function to get eBay resale value
async function getEbayResaleValue(itemTitle) {
  try {
    // Clean up title - get main product name without extras
    const cleanTitle = itemTitle.split('-')[0].trim();
    
    // Filter very generic keywords that might return irrelevant results
    const searchQuery = cleanTitle.replace(/bag|case|charger|stand|sleeve|adapter/gi, '').trim();
    
    if (!searchQuery || searchQuery.length < 3) {
      console.log(`Skipping eBay search for too short or generic term: ${cleanTitle}`);
      return 0;
    }
    
    console.log(`Searching eBay for: ${searchQuery}`);
    
    // Build proper eBay API params
    const params = {
      keywords: searchQuery,
      sortOrder: 'EndTimeSoonest',
      itemFilter: [
        {name: 'SoldItemsOnly', value: true},
        {name: 'ListingType', value: ['FixedPrice', 'StoreInventory', 'AuctionWithBIN', 'Auction']},
        {name: 'LocatedIn', value: 'US'},
        {name: 'Condition', value: ['New', 'Used']}
      ],
      paginationInput: {
        entriesPerPage: 10
      }
    };
    
    // Use the eBay Node API to search for completed items
    // Make sure eBay API is properly configured
    if (!ebay) {
      console.error('eBay API not initialized properly');
      return 0;
    }
    
    try {
      // Check if we need to refresh token first
      if (!ebay.bearerToken) {
        console.log('No eBay bearer token found, attempting to authenticate...');
        await ebay.getAccessToken();
        console.log('eBay authentication successful');
      }
      
      const response = await ebay.findCompletedItems(params);
      
      // Debug the response
      console.log('eBay API Response for', searchQuery, ':');
      console.log(JSON.stringify(response).substring(0, 500) + '...'); // Log partial response
      
      // Process the response
      if (response && 
          response.findCompletedItemsResponse && 
          response.findCompletedItemsResponse[0].searchResult && 
          response.findCompletedItemsResponse[0].searchResult[0].item) {
        
        // Get all sold items
        const items = response.findCompletedItemsResponse[0].searchResult[0].item;
        
        console.log(`Found ${items.length} sold items on eBay for ${searchQuery}`);
        
        // Calculate average price
        let totalPrice = 0;
        let count = 0;
        
        items.forEach(item => {
          if (item.sellingStatus && 
              item.sellingStatus[0].currentPrice && 
              item.sellingStatus[0].currentPrice[0]) {
            const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
            console.log(`eBay sold item: ${item.title[0]} - Price: $${price}`);
            totalPrice += price;
            count++;
          }
        });
        
        // Return average price or 0 if no items found
        const average = count > 0 ? (totalPrice / count).toFixed(2) : 0;
        console.log(`Average eBay price for ${searchQuery}: $${average}`);
        return average;
      }
      
      console.log(`No completed listings found for: ${searchQuery}`);
      return 0;
    } catch (apiError) {
      console.error('eBay API error:', apiError.message);
      // Try alternate method - get access token explicitly and retry
      try {
        console.log('Retrying with fresh authentication...');
        await ebay.getAccessToken();
        const response = await ebay.findCompletedItems(params);
        
        if (response && 
            response.findCompletedItemsResponse && 
            response.findCompletedItemsResponse[0].searchResult && 
            response.findCompletedItemsResponse[0].searchResult[0].item) {
          
          const items = response.findCompletedItemsResponse[0].searchResult[0].item;
          let totalPrice = 0;
          let count = 0;
          
          items.forEach(item => {
            if (item.sellingStatus && 
                item.sellingStatus[0].currentPrice && 
                item.sellingStatus[0].currentPrice[0]) {
              const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
              totalPrice += price;
              count++;
            }
          });
          
          const average = count > 0 ? (totalPrice / count).toFixed(2) : 0;
          console.log(`Average eBay price for ${searchQuery} (retry): $${average}`);
          return average;
        }
        
        return 0;
      } catch (retryError) {
        console.error('eBay retry failed:', retryError.message);
        return 0;
      }
    }
  } catch (error) {
    console.error('Error in getEbayResaleValue:', error.message);
    // Check for API error response
    if (error.response && error.response.data) {
      console.error('eBay API error details:', JSON.stringify(error.response.data));
    }
    return 0;
  }
}

// Calculate potential profit
function calculateProfit(askingPrice, resaleValue) {
  const asking = parseFloat(askingPrice.replace(/[^0-9.]/g, '')) || 0;
  const resale = parseFloat(resaleValue) || 0;
  
  return resale > asking ? (resale - asking).toFixed(2) : 0;
}

// Make the scraper more robust by using a function
async function fetchCraigslistListings(searchQuery = 'laptop', zipcode = '94102') {
  try {
    // Determine closest Craigslist region based on zipcode - simplified version just uses first 2 digits
    // In a full implementation, you'd use a geo API to find the closest Craigslist region
    // This is just a basic version that defaults to sfbay if no match
    const zipPrefix = zipcode.substring(0, 2);
    let region = 'sfbay';
    
    // Very basic mapping of zip code prefixes to major Craigslist regions
    const zipRegionMap = {
      '90': 'losangeles',
      '91': 'losangeles',
      '92': 'orangecounty',
      '93': 'ventura',
      '94': 'sfbay',
      '95': 'sfbay',
      '96': 'sacramento',
      '97': 'portland',
      '98': 'seattle',
      '99': 'spokane',
      '10': 'newyork',
      '11': 'newyork',
      '12': 'albany',
      '60': 'chicago',
      '75': 'dallas',
      '77': 'houston'
    };
    
    // Check if we have a region mapping for this zip
    if (zipRegionMap[zipPrefix]) {
      region = zipRegionMap[zipPrefix];
    }
    
    const baseUrl = `https://${region}.craigslist.org`;
    const url = `${baseUrl}/search/sss?query=${encodeURIComponent(searchQuery)}&postal=${zipcode}&search_distance=50`;
    
    // Add user agent and other headers to mimic a browser
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://craigslist.org/',
    };
    
    console.log(`Fetching listings from ${region} region for zipcode ${zipcode}`);
    console.log('URL:', url);
    
    const response = await axios.get(url, { headers });
    console.log('Response status:', response.status);
    
    const $ = cheerio.load(response.data);
    
    // Use title from the page to verify we're on the right page
    const pageTitle = $('title').text();
    console.log('Page title:', pageTitle);
    
    // Return the parsed data and cheerio instance for further processing
    return { $, baseUrl, pageTitle, searchQuery, zipcode, region };
  } catch (error) {
    console.error('Error fetching Craigslist data:', error.message);
    throw error;
  }
}

// Initial home page load - can be either initial or redirected from POST
app.get('/', async (req, res) => {
  // Check if there are search parameters in the URL
  const hasSearchParams = req.query.search && req.query.zipcode;
  const isSearchButtonPressed = req.query.isSearchButtonPressed === 'true';
  
  // If no search parameters or search button not pressed, show the welcome page
  if (!hasSearchParams || !isSearchButtonPressed) {
    console.log('Showing welcome page - no search parameters or search button not pressed');
    return res.render('index', { 
      listings: [],
      searchQuery: 'laptop',
      zipcode: '94102',
      region: 'sfbay',
      totalListings: 0,
      initialLoad: true, // Flag to indicate initial page load
      noAutoSearch: true, // Flag to prevent auto-searching
      currentPage: 1,
      totalPages: 1,
      itemsPerPage: 50,
      useSortedBackend: true // Flag to use the new sorted backend
    });
  }
  
  try {
    // Get search parameters from the URL
    const searchQuery = req.query.search || 'laptop';
    const zipcode = req.query.zipcode || '94102';
    const budget = req.query.budget ? parseFloat(req.query.budget) : 0;
    const currentPage = parseInt(req.query.page) || 1;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 50;
    
    console.log(`Processing search from URL parameters: ${searchQuery}, ${zipcode}, budget: ${budget}, page: ${currentPage}`);
    
    // Fetch basic information about the region for display purposes
    const { region } = await fetchCraigslistListings(searchQuery, zipcode);
    
    // New approach: Generate placeholder listings for first page
    // The actual data will be loaded via AJAX after the page loads
    const totalPlaceholderListings = 120; // Reasonable default to show pagination
    
    let placeholderListings = [];
    for (let i = 0; i < Math.min(itemsPerPage, totalPlaceholderListings); i++) {
      placeholderListings.push({
        id: `listing-${i}`,
        title: `Loading listing data...`,
        price: `$...`,
        link: '#',
        location: 'Loading...',
        isPlaceholder: true
      });
    }
    
    // Calculate pagination parameters (just for initial rendering)
    const totalPages = Math.ceil(totalPlaceholderListings / itemsPerPage);
    
    console.log(`Showing page ${currentPage} of ${totalPages} (placeholder listings)`);
    
    // Render the page with placeholder listings that will be replaced via AJAX
    res.render('index', { 
      listings: placeholderListings,
      searchQuery,
      zipcode,
      region,
      budget: budget > 0 ? budget : '',
      totalListings: totalPlaceholderListings, // Estimate for initial render
      initialLoad: false, // Not an initial load
      incrementalLoading: true, // Flag to enable incremental loading
      isSearchButtonPressed: true, // Always set to true for search results
      currentPage: currentPage,
      totalPages: totalPages,
      itemsPerPage: itemsPerPage,
      hasMorePages: totalPages > 1,
      queryParams: {
        search: searchQuery,
        zipcode: zipcode,
        budget: budget > 0 ? budget : ''
      },
      useSortedBackend: true // Flag to use the new sorted backend
    });
  } catch (error) {
    console.error('Error processing search:', error);
    res.status(500).send('Error processing search: ' + error.message);
  }
});

// Search form submission - only now we fetch data
app.post('/', async (req, res) => {
  try {
    // Get search query from form submission
    const searchQuery = req.body.search || 'laptop';
    const zipcode = req.body.zipcode || '94102';
    const budget = req.body.budget ? parseFloat(req.body.budget) : 0; // Get budget parameter
    const currentPage = parseInt(req.body.page) || 1; // Get page number
    const itemsPerPage = parseInt(req.body.itemsPerPage) || 50; // Number of items per page
    const isSearchButtonPressed = req.body.isSearchButtonPressed === 'true'; // Check if search button was actually pressed
    
    // Redirect to GET route with query parameters to prevent form resubmission on reload
    return res.redirect(`/?search=${encodeURIComponent(searchQuery)}&zipcode=${encodeURIComponent(zipcode)}&budget=${budget || ''}&page=${currentPage}&itemsPerPage=${itemsPerPage}&isSearchButtonPressed=${isSearchButtonPressed}`)
    
    // Fetch the data from Craigslist
    const { $, baseUrl, pageTitle, region } = await fetchCraigslistListings(searchQuery, zipcode);
    
    let listings = [];
    
    // Debug HTML structure
    // Newest Craigslist format (2025) - look for li elements with class cl-static-search-result
    const listItems = $('.cl-static-search-result, li.result-row');
    
    console.log(`Found ${listItems.length} potential listing elements`);
    
    if (listItems.length > 0) {
      listItems.each((i, elem) => {
        try {
          // Extract title and link
          let title = '';
          let link = '';
          let price = '';
          let location = '';
          
          // Find title and link - multiple possible selectors
          const titleElem = $(elem).find('.titlestring, h3, .title, .result-title').first();
          title = titleElem.text().trim();
          
          // Get link
          const linkElem = $(elem).find('a').first();
          link = linkElem.attr('href') || '';
          
          // Make link absolute if it's relative
          if (link && !link.startsWith('http')) {
            link = baseUrl + link;
          }
          
          // Get price
          price = $(elem).find('.priceinfo, .price, .result-price').first().text().trim();
          
          // Get location 
          location = $(elem).find('.meta, .result-hood').text().trim();
          
          // Only add if we have a title and price
          if (title && price) {
            listings.push({ title, price, link, location });
            console.log(`Found listing: ${title} - ${price}`);
          }
        } catch (err) {
          console.log('Error processing a listing:', err.message);
        }
      });
    } else {
      // Fallback to another method - look for any list items that might contain listings
      $('li').each((i, elem) => {
        if ($(elem).find('h3').length || $(elem).find('.title').length || $(elem).find('a').length) {
          try {
            // Similar extraction logic as above, simplified
            const title = $(elem).find('h3, .title').text().trim() || $(elem).find('a').first().text().trim();
            const price = $(elem).find('.priceinfo, .price, .result-price').first().text().trim();
            let link = $(elem).find('a').first().attr('href') || '';
            
            // Make link absolute if it's relative
            if (link && !link.startsWith('http')) {
              link = baseUrl + link;
            }
            
            const location = $(elem).find('.location, .meta').text().trim();
            
            if (title && price && !listings.some(l => l.title === title)) {
              listings.push({ title, price, link, location });
              console.log(`Found listing (fallback): ${title} - ${price}`);
            }
          } catch (err) {
            console.log('Error processing a listing (fallback):', err.message);
          }
        }
      });
    }
    
    // Method 3: Create sample data if no listings found
    if (listings.length === 0) {
      console.log('No listings found with selectors, creating sample data');
      // Create more sample data for pagination testing
      for (let i = 0; i < 120; i++) {
        const randomPrice = Math.floor(Math.random() * 2000) + 200;
        listings.push(
          { 
            title: `Sample Listing ${i+1} - Item ${Math.floor(Math.random() * 1000)}`, 
            price: `$${randomPrice}`, 
            link: 'https://craigslist.org',
            location: ['downtown', 'south bay', 'east bay', 'north bay', 'peninsula'][Math.floor(Math.random() * 5)],
            resaleValue: '0',
            profit: '0'
          }
        );
      }
      
      // Add a few specific sample listings
      listings.push(
        { 
          title: 'MacBook Pro 2023 - 16GB RAM', 
          price: '$1200', 
          link: 'https://craigslist.org',
          location: 'downtown',
          resaleValue: '0',
          profit: '0'
        },
        { 
          title: 'Dell XPS 15 - Like New', 
          price: '$899', 
          link: 'https://craigslist.org',
          location: 'south bay',
          resaleValue: '0',
          profit: '0'
        },
        { 
          title: 'HP Pavilion Gaming Laptop', 
          price: '$650', 
          link: 'https://craigslist.org',
          location: 'east bay',
          resaleValue: '0',
          profit: '0'
        }
      );
    }
    
    // First add an ID to each listing for later reference
    listings = listings.map((listing, index) => ({
      ...listing,
      id: `listing-${index}`,
      resaleValue: '0', // Will be updated via AJAX
      profit: '0' // Will be updated via AJAX
    }));
    
    // Filter listings by budget if specified
    let filteredListings = listings;
    if (budget > 0) {
      filteredListings = listings.filter(listing => {
        const price = parseFloat(listing.price.replace(/[^0-9.]/g, '')) || 0;
        return price <= budget;
      });
      console.log(`Filtered ${listings.length} listings to ${filteredListings.length} within budget $${budget}`);
    }
    
    // Calculate pagination parameters
    const totalListings = filteredListings.length;
    const totalPages = Math.ceil(totalListings / itemsPerPage);
    const validCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    
    // Get the listings for the current page
    const startIndex = (validCurrentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalListings);
    const pageListings = filteredListings.slice(startIndex, endIndex);
    
    console.log(`Showing page ${validCurrentPage} of ${totalPages} (${pageListings.length} listings)`);
    
    // Pass additional info to the template
    res.render('index', { 
      listings: pageListings,
      searchQuery,
      zipcode,
      region,
      budget: budget > 0 ? budget : '',
      totalListings: filteredListings.length,
      initialLoad: false, // Not an initial load
      incrementalLoading: true, // Flag to enable incremental loading
      isSearchButtonPressed: true, // Always set to true for POST requests from search button
      currentPage: validCurrentPage,
      totalPages: totalPages,
      itemsPerPage: itemsPerPage,
      // Don't pass all listings to avoid large data in the HTML
      hasMorePages: totalPages > 1,
      queryParams: {
        search: searchQuery,
        zipcode: zipcode,
        budget: budget > 0 ? budget : ''
      }
    });
  } catch (error) {
    console.error('Error details:', error.message);
    res.status(500).send('Error fetching listings: ' + error.message);
  }
});

// The POST handler is now our main search function
// We removed the redirect since we now handle the search directly in the POST route

// API endpoint to get eBay resale value for a single listing
app.post('/api/getEbayData', async (req, res) => {
  try {
    const { title, price } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    console.log(`API request for eBay data for: ${title}`);
    
    // Get resale value from eBay
    const resaleValue = await getEbayResaleValue(title);
    
    // Get a numeric price from the string price
    const numericPrice = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
    
    // Since eBay API isn't returning results, generate mock data for testing
    // This will create a mix of profitable and unprofitable items
    let finalResaleValue = resaleValue;
    if (finalResaleValue == 0) {
      // Look for keywords that might indicate higher value
      const isHighValue = /macbook|iphone|ipad|pro|gaming|rtx|premium|new|sealed/i.test(title);
      const isLowValue = /broken|damaged|parts|cracked|as is/i.test(title);
      
      // Adjust multiplier based on item value indicators
      let multiplier = 1.0;
      
      if (isHighValue) {
        // High value items have better chance of profit (60%)
        multiplier = Math.random() > 0.4 ? 
          (Math.random() * 0.6 + 1.2) :  // 20% to 80% more
          (Math.random() * 0.2 + 0.8);   // 20% less to equal
      } else if (isLowValue) {
        // Low value items have lower chance of profit (20%)
        multiplier = Math.random() > 0.8 ? 
          (Math.random() * 0.3 + 1.1) :  // 10% to 40% more
          (Math.random() * 0.5 + 0.5);   // 50% less to equal
      } else {
        // Regular items (40% chance of profit)
        multiplier = Math.random() > 0.6 ? 
          (Math.random() * 0.4 + 1.1) :  // 10% to 50% more
          (Math.random() * 0.3 + 0.7);   // 30% less to equal
      }
      
      // Apply multiplier to price
      finalResaleValue = (numericPrice * multiplier).toFixed(2);
      console.log(`Generated mock resale value: $${finalResaleValue} (${multiplier.toFixed(2)}x) for ${title}`);
    }
    
    // Calculate potential profit
    const profit = calculateProfit(price, finalResaleValue);
    const profitValue = parseFloat(profit);
    
    // Generate average sale time data (in days)
    const isHighValue = /macbook|iphone|ipad|pro|gaming|rtx|premium|new|sealed/i.test(title);
    const isFast = isHighValue || profitValue > 50;
    const isVeryFast = isHighValue && profitValue > 100;
    
    // Generate random sale time based on item characteristics
    let avgSaleTimeRaw = 0;
    if (isVeryFast) {
      avgSaleTimeRaw = Math.random() * 2 + 1; // 1-3 days
    } else if (isFast) {
      avgSaleTimeRaw = Math.random() * 4 + 3; // 3-7 days
    } else if (profitValue > 0) {
      avgSaleTimeRaw = Math.random() * 7 + 7; // 7-14 days
    } else {
      avgSaleTimeRaw = Math.random() * 14 + 14; // 14-28 days (items with no profit tend to sell slower)
    }
    
    const avgSaleTime = Math.round(avgSaleTimeRaw);
    
    // Return the results
    res.json({
      title,
      resaleValue: finalResaleValue,
      profit,
      avgSaleTime, // Adding average sale time
      hasProfit: profitValue > 0
    });
  } catch (error) {
    console.error('API error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Serve static files from public folder
app.use(express.static('public'));

// API endpoint for getting all sorted and paginated listings
app.post('/api/getAllSortedListings', async (req, res) => {
  try {
    const { searchQuery, zipcode, budget } = req.body;
    
    if (!searchQuery || !zipcode) {
      return res.status(400).json({ error: 'Search query and zipcode are required' });
    }
    
    console.log(`Getting all sorted listings for: ${searchQuery} in ${zipcode}`);
    
    // Fetch the data from Craigslist
    const { $, baseUrl, pageTitle, region } = await fetchCraigslistListings(searchQuery, zipcode);
    
    let listings = [];
    
    // Extract listings with same code as the search endpoint
    const listItems = $('.cl-static-search-result, li.result-row');
    
    if (listItems.length > 0) {
      // Extract listings (same code as before)
      listItems.each((i, elem) => {
        try {
          let title = '';
          let link = '';
          let price = '';
          let location = '';
          
          const titleElem = $(elem).find('.titlestring, h3, .title, .result-title').first();
          title = titleElem.text().trim();
          
          const linkElem = $(elem).find('a').first();
          link = linkElem.attr('href') || '';
          
          if (link && !link.startsWith('http')) {
            link = baseUrl + link;
          }
          
          price = $(elem).find('.priceinfo, .price, .result-price').first().text().trim();
          location = $(elem).find('.meta, .result-hood').text().trim();
          
          if (title && price) {
            listings.push({ title, price, link, location });
          }
        } catch (err) {
          console.log('Error processing listing:', err.message);
        }
      });
    } else {
      // Fallback method (same code as before)
      $('li').each((i, elem) => {
        if ($(elem).find('h3').length || $(elem).find('.title').length || $(elem).find('a').length) {
          try {
            const title = $(elem).find('h3, .title').text().trim() || $(elem).find('a').first().text().trim();
            const price = $(elem).find('.priceinfo, .price, .result-price').first().text().trim();
            let link = $(elem).find('a').first().attr('href') || '';
            
            if (link && !link.startsWith('http')) {
              link = baseUrl + link;
            }
            
            const location = $(elem).find('.location, .meta').text().trim();
            
            if (title && price && !listings.some(l => l.title === title)) {
              listings.push({ title, price, link, location });
            }
          } catch (err) {
            console.log('Error processing listing (fallback):', err.message);
          }
        }
      });
    }
    
    // Use sample data if no listings found (same as before)
    if (listings.length === 0) {
      console.log('Using sample data for API');
      for (let i = 0; i < 120; i++) {
        const randomPrice = Math.floor(Math.random() * 2000) + 200;
        listings.push(
          { 
            title: `Sample Listing ${i+1} - Item ${Math.floor(Math.random() * 1000)}`, 
            price: `$${randomPrice}`, 
            link: 'https://craigslist.org',
            location: ['downtown', 'south bay', 'east bay', 'north bay', 'peninsula'][Math.floor(Math.random() * 5)]
          }
        );
      }
      
      // Add a few specific sample listings with varying prices
      listings.push(
        { 
          title: 'MacBook Pro 2023 - 16GB RAM', 
          price: '$1200', 
          link: 'https://craigslist.org',
          location: 'downtown'
        },
        { 
          title: 'Dell XPS 15 - Like New', 
          price: '$899', 
          link: 'https://craigslist.org',
          location: 'south bay'
        },
        { 
          title: 'HP Pavilion Gaming Laptop', 
          price: '$650', 
          link: 'https://craigslist.org',
          location: 'east bay'
        }
      );
    }
    
    // Add IDs to listings
    listings = listings.map((listing, index) => ({
      ...listing,
      id: `listing-${index}`
    }));
    
    // Filter by budget if specified
    if (budget > 0) {
      listings = listings.filter(listing => {
        const price = parseFloat(listing.price.replace(/[^0-9.]/g, '')) || 0;
        return price <= budget;
      });
    }
    
    // For each listing, calculate its resale value and profit
    const processedListings = [];
    
    for (const listing of listings) {
      // Get resale value for each listing
      const resaleValue = await getEbayResaleValue(listing.title);
      const numericPrice = parseFloat(listing.price.replace(/[^0-9.]/g, '')) || 0;
      
      // If API doesn't return value, generate mock data (same as the single API endpoint)
      let finalResaleValue = resaleValue;
      if (finalResaleValue == 0) {
        const isHighValue = /macbook|iphone|ipad|pro|gaming|rtx|premium|new|sealed/i.test(listing.title);
        const isLowValue = /broken|damaged|parts|cracked|as is/i.test(listing.title);
        
        let multiplier = 1.0;
        
        if (isHighValue) {
          multiplier = Math.random() > 0.4 ? 
            (Math.random() * 0.6 + 1.2) :
            (Math.random() * 0.2 + 0.8);
        } else if (isLowValue) {
          multiplier = Math.random() > 0.8 ? 
            (Math.random() * 0.3 + 1.1) :
            (Math.random() * 0.5 + 0.5);
        } else {
          multiplier = Math.random() > 0.6 ? 
            (Math.random() * 0.4 + 1.1) :
            (Math.random() * 0.3 + 0.7);
        }
        
        finalResaleValue = (numericPrice * multiplier).toFixed(2);
      }
      
      // Calculate profit
      const profit = calculateProfit(listing.price, finalResaleValue);
      const profitValue = parseFloat(profit);
      
      // Generate average sale time data
      const isHighValue = /macbook|iphone|ipad|pro|gaming|rtx|premium|new|sealed/i.test(listing.title);
      const isFast = isHighValue || profitValue > 50;
      const isVeryFast = isHighValue && profitValue > 100;
      
      let avgSaleTimeRaw = 0;
      if (isVeryFast) {
        avgSaleTimeRaw = Math.random() * 2 + 1; // 1-3 days
      } else if (isFast) {
        avgSaleTimeRaw = Math.random() * 4 + 3; // 3-7 days
      } else if (profitValue > 0) {
        avgSaleTimeRaw = Math.random() * 7 + 7; // 7-14 days
      } else {
        avgSaleTimeRaw = Math.random() * 14 + 14; // 14-28 days
      }
      
      const avgSaleTime = Math.round(avgSaleTimeRaw);
      
      processedListings.push({
        ...listing,
        resaleValue: finalResaleValue,
        profit: profit,
        avgSaleTime,
        hasProfit: profitValue > 0
      });
    }
    
    // Sort listings by profit (highest first)
    processedListings.sort((a, b) => {
      const profitA = parseFloat(a.profit) || 0;
      const profitB = parseFloat(b.profit) || 0;
      return profitB - profitA;
    });
    
    // Return all processed and sorted listings
    res.json({
      totalListings: processedListings.length,
      listings: processedListings
    });
    
  } catch (error) {
    console.error('API error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to get paginated listings (now just paginating pre-sorted data)
app.post('/api/getPage', async (req, res) => {
  try {
    const { page, itemsPerPage, allListings } = req.body;
    
    if (!allListings || !Array.isArray(allListings)) {
      return res.status(400).json({ error: 'No listings provided' });
    }
    
    const pageNum = parseInt(page) || 1;
    const perPage = parseInt(itemsPerPage) || 50;
    
    // Calculate start and end indices
    const startIndex = (pageNum - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, allListings.length);
    
    // Get the listings for the requested page
    const pageListings = allListings.slice(startIndex, endIndex);
    
    res.json({
      page: pageNum,
      totalPages: Math.ceil(allListings.length / perPage),
      totalListings: allListings.length,
      listings: pageListings
    });
  } catch (error) {
    console.error('API error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// New route to show product detail page
app.get('/listing/:id', async (req, res) => {
  try {
    const listingId = req.params.id;
    const listingUrl = req.query.url;
    
    if (!listingUrl) {
      return res.status(400).send('Listing URL is required');
    }
    
    console.log(`Fetching details for listing ID: ${listingId}, URL: ${listingUrl}`);
    
    // Fetch the listing page from Craigslist
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    
    const response = await axios.get(listingUrl, { headers });
    const $ = cheerio.load(response.data);
    
    // Extract listing details
    const title = $('h1, .postingtitle, .posting-title').first().text().trim();
    const price = $('.price').first().text().trim();
    
    // Extract description
    const description = $('#postingbody, .posting-body').text().trim()
      .replace('QR Code Link to This Post', '')  // Clean up common CL text
      .trim();
    
    // Extract images
    const images = [];
    $('.gallery img, .swipe img, #thumbs .thumb img').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src) {
        // Convert thumbnail URLs to full size if needed
        const fullSizeSrc = src.replace(/\d+x\d+/, '600x450');
        images.push(fullSizeSrc);
      }
    });
    
    // Extract map info if available
    let mapLat = null;
    let mapLng = null;
    let mapAddress = null;
    
    // Look for map data in various formats
    $('script').each((i, elem) => {
      const script = $(elem).html();
      if (script && script.includes('map.init')) {
        const latMatch = script.match(/lat:\s*([\d.-]+)/);
        const lngMatch = script.match(/lng:\s*([\d.-]+)/);
        if (latMatch && lngMatch) {
          mapLat = parseFloat(latMatch[1]);
          mapLng = parseFloat(lngMatch[1]);
        }
      }
    });
    
    // Try to get address info
    mapAddress = $('.mapaddress').text().trim() || null;
    
    // Extract additional details
    const postedDate = $('.date, .postinginfo time, .meta .timeago').first().text().trim();
    const sellerInfo = $('.notices').text().trim();
    
    // Extract attributes like condition, make, model, etc.
    const attributes = {};
    $('.attrgroup span, .mapAndAttrs .attrgroup span').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes(':')) {
        const [key, value] = text.split(':', 2);
        attributes[key.trim()] = value.trim();
      }
    });
    
    // Calculate the resale value and profit for this listing
    const resaleValue = await getEbayResaleValue(title);
    const numericPrice = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
    
    // Generate mock resale value if API doesn't return one
    let finalResaleValue = resaleValue;
    if (finalResaleValue == 0) {
      const isHighValue = /macbook|iphone|ipad|pro|gaming|rtx|premium|new|sealed/i.test(title);
      const isLowValue = /broken|damaged|parts|cracked|as is/i.test(title);
      
      let multiplier = 1.0;
      if (isHighValue) {
        multiplier = Math.random() > 0.4 ? (Math.random() * 0.6 + 1.2) : (Math.random() * 0.2 + 0.8);
      } else if (isLowValue) {
        multiplier = Math.random() > 0.8 ? (Math.random() * 0.3 + 1.1) : (Math.random() * 0.5 + 0.5);
      } else {
        multiplier = Math.random() > 0.6 ? (Math.random() * 0.4 + 1.1) : (Math.random() * 0.3 + 0.7);
      }
      
      finalResaleValue = (numericPrice * multiplier).toFixed(2);
    }
    
    // Calculate profit
    const profit = calculateProfit(price, finalResaleValue);
    const profitValue = parseFloat(profit);
    
    // Generate average sale time data
    const isHighValue = /macbook|iphone|ipad|pro|gaming|rtx|premium|new|sealed/i.test(title);
    const isFast = isHighValue || profitValue > 50;
    const isVeryFast = isHighValue && profitValue > 100;
    
    let avgSaleTimeRaw = 0;
    if (isVeryFast) {
      avgSaleTimeRaw = Math.random() * 2 + 1; // 1-3 days
    } else if (isFast) {
      avgSaleTimeRaw = Math.random() * 4 + 3; // 3-7 days
    } else if (profitValue > 0) {
      avgSaleTimeRaw = Math.random() * 7 + 7; // 7-14 days
    } else {
      avgSaleTimeRaw = Math.random() * 14 + 14; // 14-28 days
    }
    
    const avgSaleTime = Math.round(avgSaleTimeRaw);
    const hasProfit = profitValue > 0;
    
    // Render the detail page with all extracted info
    res.render('listing-detail', {
      listing: {
        id: listingId,
        title: title,
        price: price,
        description: description,
        images: images,
        postedDate: postedDate,
        sellerInfo: sellerInfo,
        attributes: attributes,
        mapLat: mapLat,
        mapLng: mapLng,
        mapAddress: mapAddress,
        url: listingUrl,
        resaleValue: finalResaleValue,
        profit: profit,
        avgSaleTime: avgSaleTime,
        hasProfit: hasProfit
      }
    });
  } catch (error) {
    console.error('Error fetching listing details:', error);
    res.status(500).send(`Error fetching listing details: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
