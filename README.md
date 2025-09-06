# Craigslist-eBay Price Analyzer

A web application that analyzes Craigslist listings and compares them with eBay sold prices to find profitable resale opportunities.

## Features

- Search Craigslist listings by keyword and location
- Calculate potential resale profit based on eBay's historical sold prices
- Sort results by profit potential
- Filter listings by budget
- Pagination for easy browsing
- Displays estimated average sale time

## Tech Stack

- Node.js
- Express.js
- EJS templates
- Axios for HTTP requests
- Cheerio for HTML parsing
- eBay API for pricing data

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- eBay Developer API credentials

### Installation

1. Clone this repository
```bash
git clone https://github.com/yourusername/craigslist-ebay-analyzer.git
cd craigslist-ebay-analyzer
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file with your eBay API credentials
```
EBAY_APP_ID=your_app_id_here
EBAY_CERT_ID=your_cert_id_here
EBAY_DEV_ID=your_dev_id_here
EBAY_ENV=PRODUCTION
```

4. Start the server
```bash
npm start
```

5. Open your browser and go to `http://localhost:3000`

## Deployment

This application is configured for deployment on Render.com using the included `render.yaml` file.

## License

MIT
