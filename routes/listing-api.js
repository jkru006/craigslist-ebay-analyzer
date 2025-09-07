// API route to get listing details for the modal
const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const { eBayApiCall } = require('../utils/ebay-api'); // Adjust path if needed

router.get('/api/listing-details', async (req, res) => {
  try {
    const listingId = req.query.id;
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing listing URL' });
    }
    
    // Fetch the original Craigslist page
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Extract listing data
    const title = $('.postingtitle h1, .title h1').text().trim() || $('.title').text().trim();
    const price = $('.price').text().trim() || 'Price not specified';
    const description = $('#postingbody').html() || $('.postingbody').html() || 'No description available';
    const postedDate = $('.postinginfo time').attr('datetime') || $('.date').text().trim() || null;
    
    // Extract images
    const images = [];
    $('.swipe img, .gallery img').each((index, element) => {
      const src = $(element).attr('src');
      if (src && !images.includes(src)) {
        images.push(src);
      }
    });
    
    // If no images found in gallery, try to find them in thumbs or other image containers
    if (images.length === 0) {
      $('img').each((index, element) => {
        const src = $(element).attr('src');
        if (src && src.includes('images.craigslist') && !images.includes(src)) {
          // Replace thumbnail URL with full-size image URL if needed
          const fullSizeSrc = src.replace('50x50c', '600x450');
          images.push(fullSizeSrc);
        }
      });
    }
    
    // Extract item attributes (key-value pairs)
    const attributes = {};
    $('.attrgroup span').each((index, element) => {
      const text = $(element).text().trim();
      // Check if this is a key-value pair (contains a colon)
      if (text.includes(':')) {
        const [key, value] = text.split(':').map(part => part.trim());
        attributes[key] = value;
      }
    });
    
    // Extract map data
    let mapLat = null;
    let mapLng = null;
    let mapAddress = null;
    
    // Try to find the map data in various formats
    // Method 1: Look for data attributes
    const mapDiv = $('#map');
    if (mapDiv.length > 0) {
      mapLat = mapDiv.data('latitude') || null;
      mapLng = mapDiv.data('longitude') || null;
    }
    
    // Method 2: Parse from script tags
    if (!mapLat || !mapLng) {
      $('script').each((index, element) => {
        const scriptContent = $(element).html();
        // Look for map initialization with coordinates
        if (scriptContent && scriptContent.includes('var map')) {
          const latMatch = scriptContent.match(/var\s+lat\s*=\s*([-+]?\d*\.\d+|\d+)/i);
          const lngMatch = scriptContent.match(/var\s+lng\s*=\s*([-+]?\d*\.\d+|\d+)/i);
          
          if (latMatch && lngMatch) {
            mapLat = parseFloat(latMatch[1]);
            mapLng = parseFloat(lngMatch[1]);
          }
        }
      });
    }
    
    // Method 3: Look for map in a frame or data attributes elsewhere
    if (!mapLat || !mapLng) {
      const mapData = $('[data-latitude], [data-lat]').first();
      if (mapData.length > 0) {
        mapLat = mapData.data('latitude') || mapData.data('lat') || null;
        mapLng = mapData.data('longitude') || mapData.data('lng') || null;
      }
    }
    
    // Extract address if available
    $('.mapaddress').each((index, element) => {
      mapAddress = $(element).text().trim();
    });
    
    // Get eBay data for profit analysis
    const searchQuery = title.split('-')[0].trim(); // Use first part of title for better results
    let ebayData = {
      hasProfit: false,
      profit: 0,
      resaleValue: 0,
      avgSaleTime: 30 // Default value
    };
    
    try {
      const ebayResponse = await eBayApiCall(searchQuery, false);
      if (ebayResponse && ebayResponse.averagePrice) {
        const craigslistPrice = parseFloat(price.replace(/[$,]/g, '')) || 0;
        const ebayPrice = ebayResponse.averagePrice;
        const profit = ebayPrice - craigslistPrice;
        
        ebayData = {
          hasProfit: profit > 0,
          profit: profit.toFixed(2),
          resaleValue: ebayPrice.toFixed(2),
          avgSaleTime: ebayResponse.averageSaleDays || 30
        };
      }
    } catch (ebayError) {
      console.error('Error fetching eBay data:', ebayError);
    }
    
    // Combine all data
    const listingData = {
      id: listingId,
      url,
      title,
      price,
      description,
      postedDate,
      images,
      attributes,
      mapLat,
      mapLng,
      mapAddress,
      ...ebayData
    };
    
    res.json(listingData);
  } catch (error) {
    console.error('Error fetching listing details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch listing details',
      message: error.message
    });
  }
});

module.exports = router;
