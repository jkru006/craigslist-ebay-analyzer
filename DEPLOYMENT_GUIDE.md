# Deployment Guide for Resale Analyzer App

## Prerequisites
- GitHub account (connected to your repository)
- Render account (free tier works fine)
- eBay Developer API credentials

## Deployment Steps

### 1. Push your code to GitHub
```bash
git add .
git commit -m "Your commit message"
git push origin master
```

### 2. Deploy to Render

1. **Log in to Render Dashboard**
   - Go to [https://dashboard.render.com/](https://dashboard.render.com/)

2. **Create a New Blueprint Instance**
   - Navigate to "Blueprints" section
   - Click "New Blueprint Instance"
   - Select your GitHub repository: `jkru006/craigslist-ebay-analyzer`

3. **Apply Blueprint**
   - Render will automatically detect your `render.yaml` configuration
   - Review the settings
   - Click "Apply" to create and deploy your service

### 3. Configure Environment Variables

Your `render.yaml` already specifies most environment variables, but you'll need to add your eBay API credentials:

1. Once your service is deployed, go to your service dashboard
2. Navigate to "Environment" section
3. Add the following environment variables:
   - `EBAY_APP_ID`: Your eBay App ID
   - `EBAY_CERT_ID`: Your eBay Cert ID
   - `EBAY_DEV_ID`: Your eBay Dev ID

4. Save changes and your service will automatically redeploy with the new variables

### 4. Monitor Your Deployment

1. Watch the deployment logs for any errors
2. Once deployment is complete, click the URL provided by Render to access your app
3. Test to ensure everything is working correctly

## Troubleshooting

- **Application Error**: Check logs for specific error messages
- **API Issues**: Verify your eBay API credentials are correct
- **Memory/CPU Limits**: Free tier has limitations - monitor usage in Render dashboard
