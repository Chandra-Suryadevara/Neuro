# 🚀 Deploy to Render.com (Free)

## Step-by-Step Deployment Guide

### 1. Push to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Psychology experiment app"

# Create a new repository on GitHub.com, then:
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Render

1. **Go to [render.com](https://render.com)** and sign up (free)

2. **Click "New +" → "Web Service"**

3. **Connect your GitHub repository**

4. **Configure the service:**
   - **Name**: `psychology-experiment` (or any name you like)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Select **Free**

5. **Click "Create Web Service"**

6. **Wait 2-3 minutes** for deployment to complete

7. **Your app will be live at**: `https://your-app-name.onrender.com`

### 3. Access Your App

Once deployed, share these URLs with participants:

- **Participant page**: `https://your-app-name.onrender.com`
- **Admin dashboard**: `https://your-app-name.onrender.com/admin.html`

## 📱 Works on ALL Devices!

- ✅ iPhone/iPad (Safari)
- ✅ Android phones
- ✅ Desktop browsers
- ✅ Any device with internet

## Important Notes

- **Free tier**: App sleeps after 15 minutes of inactivity
- **First load**: May take 30-60 seconds to wake up
- **No configuration needed**: Everything is already set up!

## Alternative: Railway.app

If you prefer Railway:

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Done! No configuration needed.

---

**Need help?** The app is already configured for deployment. Just follow the steps above!
