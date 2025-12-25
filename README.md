# Campaign Analytics App

A full-stack application for analyzing campaign performance from CSV uploads.

## Features

- Upload campaign data via CSV file
- View campaign analytics including:
  - Total followers gained
  - Overall engagement rate
  - Top 5 posts by engagement rate (highlighted in green)
  - Top 5 posts by shares (highlighted in orange)
  - Best performing media type
  - Filter posts by media type
  - Toggle average engagement rate display

## Setup

### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The backend server will run on `http://localhost:5000`

### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## CSV Format

The CSV file should include the following columns:
- `engagement_rate` (number)
- `media_type` (string)
- `followers_gained` (number)
- `shares` (number)
- `saves` (number)

## API Endpoints

- `POST /campaigns/` - Upload a CSV file and create a campaign
- `GET /campaigns/` - Get all campaigns
- `GET /campaigns/:id` - Get a specific campaign
- `GET /campaigns/:id/average-engagement-rate` - Get average engagement rate for a campaign

