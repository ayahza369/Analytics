import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

// Backend API URL configuration
// Use direct URL to avoid proxy issues with file uploads
// Port 5001 to avoid conflict with macOS AirPlay Receiver on port 5000
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Create axios instance with explicit base URL
// Using direct URL instead of proxy for more reliable file uploads
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 second timeout for file uploads
  withCredentials: false, // Don't send credentials for CORS
});

// Add request interceptor to log requests and handle FormData properly
api.interceptors.request.use(
  (config) => {
    // For FormData, remove Content-Type header to let browser set it with boundary
    if (config.data instanceof FormData) {
      // Remove any existing Content-Type header
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
      // Let axios/browser set it automatically with the correct boundary
    }
    
    // Build full URL for logging
    const fullURL = config.baseURL 
      ? `${config.baseURL}${config.url}` 
      : config.url;
    
    console.log('API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: fullURL,
      hasFormData: config.data instanceof FormData,
      headers: Object.keys(config.headers || {})
    });
    
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    console.error('API Error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL
    });
    
    // Handle protocol mismatch errors
    if (error.message && (error.message.includes('Mixed Content') || error.message.includes('HTTPS'))) {
      console.error('Protocol mismatch detected');
      error.message = 'Protocol mismatch: Please ensure both frontend and backend use HTTP for local development';
    }
    return Promise.reject(error);
  }
);

function App() {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState('all');
  const [showAverageEngagementRate, setShowAverageEngagementRate] = useState(false);
  const [averageEngagementRate, setAverageEngagementRate] = useState(null);
  const [backendConnected, setBackendConnected] = useState(null);

  // Check backend connectivity on mount and retry
  React.useEffect(() => {
    const checkBackend = async () => {
      try {
        console.log('🔍 Checking backend connection...');
        console.log('📍 API Base URL:', API_BASE_URL);
        console.log('🌐 Full health check URL:', `${API_BASE_URL}/health`);
        
        const response = await api.get('/health', {
          timeout: 5000, // 5 second timeout for health check
        });
        
        setBackendConnected(true);
        console.log('✅ Backend connection verified:', response.data);
      } catch (err) {
        setBackendConnected(false);
        const errorDetails = {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          statusText: err.response?.statusText,
          url: err.config?.url,
          baseURL: err.config?.baseURL,
          fullURL: err.config?.baseURL ? `${err.config.baseURL}${err.config.url}` : err.config?.url
        };
        
        console.error('❌ Backend connection check failed:', errorDetails);
        
        if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED') {
          console.error('💡 TROUBLESHOOTING:');
          console.error('   1. Make sure backend is running: cd backend && npm start');
          console.error('   2. Backend should be on: http://localhost:5001');
          console.error('   3. Check if port 5001 is available');
          console.error('   4. Try accessing http://localhost:5001/health in your browser');
          console.error('   Note: Port 5001 is used to avoid conflict with macOS AirPlay on port 5000');
        }
      }
    };
    
    // Check immediately
    checkBackend();
    
    // Retry every 5 seconds if not connected
    const interval = setInterval(() => {
      if (backendConnected === false || backendConnected === null) {
        console.log('🔄 Retrying backend connection...');
        checkBackend();
      } else {
        clearInterval(interval);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [backendConnected]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setCampaign(null);
    setAverageEngagementRate(null);
    setShowAverageEngagementRate(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log('=== Starting File Upload ===');
      console.log('File details:', { 
        name: file.name, 
        size: file.size, 
        type: file.type,
        lastModified: new Date(file.lastModified).toISOString()
      });
      console.log('API Base URL:', API_BASE_URL);
      console.log('FormData created:', formData.has('file'));
      
      // Use full URL path
      const uploadUrl = '/campaigns/';
      const fullRequestURL = `${API_BASE_URL}${uploadUrl}`;
      
      console.log('Upload URL:', uploadUrl);
      console.log('Full request URL:', fullRequestURL);
      
      // Make the request - axios will automatically handle FormData
      // Don't set Content-Type header - let the browser set it automatically with boundary
      const response = await api.post(uploadUrl, formData);

      console.log('✅ Upload successful!');
      console.log('Response:', response.data);
      setCampaign(response.data.campaign);
    } catch (err) {
      console.error('Upload error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        config: {
          url: err.config?.url,
          baseURL: err.config?.baseURL,
          method: err.config?.method
        }
      });
      
      let errorMessage = 'Failed to upload file';
      
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        errorMessage = `Network error: Cannot connect to backend server. 
          Please ensure:
          1. Backend server is running on http://localhost:5001
          2. No firewall is blocking the connection
          3. Check browser console for CORS errors`;
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused: Backend server is not running. Please start the backend server on port 5001.';
      } else if (err.response?.status === 403) {
        errorMessage = '403 Forbidden: CORS or permission issue. Check backend CORS configuration.';
      } else if (err.response?.status === 404) {
        errorMessage = '404 Not Found: API endpoint not found. Check backend routes.';
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      console.error('Final error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAverageEngagementRate = async () => {
    if (!campaign) return;

    if (showAverageEngagementRate) {
      setShowAverageEngagementRate(false);
      setAverageEngagementRate(null);
      return;
    }

    try {
      const response = await api.get(`/campaigns/${campaign.id}/average-engagement-rate`);
      setAverageEngagementRate(response.data.averageEngagementRate);
      setShowAverageEngagementRate(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to calculate average engagement rate');
    }
  };

  // Calculate statistics
  const calculateStats = () => {
    if (!campaign) return null;

    const posts = campaign.posts;
    const totalFollowersGained = posts.reduce((sum, post) => sum + post.followers_gained, 0);
    
    const totalEngagementRate = posts.reduce((sum, post) => sum + post.engagement_rate, 0);
    const overallEngagementRate = (totalEngagementRate / posts.length).toFixed(4);

    // Top 5 posts by engagement rate
    const top5Engagement = [...posts]
      .sort((a, b) => b.engagement_rate - a.engagement_rate)
      .slice(0, 5)
      .map(p => p.id);

    // Top 5 posts by shares
    const top5Shares = [...posts]
      .sort((a, b) => b.shares - a.shares)
      .slice(0, 5)
      .map(p => p.id);

    // Media type with highest engagement rate
    const mediaTypeStats = {};
    posts.forEach(post => {
      if (!mediaTypeStats[post.media_type]) {
        mediaTypeStats[post.media_type] = { total: 0, count: 0 };
      }
      mediaTypeStats[post.media_type].total += post.engagement_rate;
      mediaTypeStats[post.media_type].count += 1;
    });

    let bestMediaType = '';
    let bestMediaTypeRate = 0;
    Object.keys(mediaTypeStats).forEach(type => {
      const avgRate = mediaTypeStats[type].total / mediaTypeStats[type].count;
      if (avgRate > bestMediaTypeRate) {
        bestMediaTypeRate = avgRate;
        bestMediaType = type;
      }
    });

    // Get unique media types for filter
    const mediaTypes = ['all', ...new Set(posts.map(p => p.media_type))];

    return {
      totalFollowersGained,
      overallEngagementRate,
      top5Engagement,
      top5Shares,
      bestMediaType,
      bestMediaTypeRate: bestMediaTypeRate.toFixed(4),
      mediaTypes
    };
  };

  const stats = calculateStats();
  const filteredPosts = campaign && selectedMediaType !== 'all'
    ? campaign.posts.filter(post => post.media_type === selectedMediaType)
    : campaign?.posts || [];

  return (
    <div className="App">
      <header className="App-header">
        <h1>Campaign Analytics</h1>
      </header>

      <main className="App-main">
        {!campaign && (
          <div className="upload-section">
            {backendConnected === false && (
              <div className="connection-warning">
                <p>⚠️ Backend server connection failed</p>
                <p className="connection-help">
                  Please ensure the backend is running:<br/>
                  <code>cd backend && npm start</code><br/>
                  Backend should be accessible at: <code>http://localhost:5001</code><br/>
                  <small>(Port 5001 avoids conflict with macOS AirPlay on port 5000)</small>
                </p>
                <button 
                  onClick={async () => {
                    try {
                      const response = await api.get('/health');
                      setBackendConnected(true);
                      console.log('✅ Manual connection test successful:', response.data);
                    } catch (err) {
                      console.error('❌ Manual connection test failed:', err);
                      alert(`Connection failed: ${err.message}\n\nMake sure backend is running on http://localhost:5000`);
                    }
                  }}
                  className="test-connection-button"
                >
                  Test Connection
                </button>
              </div>
            )}
            {backendConnected === true && (
              <div className="connection-success">
                <p>✅ Backend connected to {API_BASE_URL}</p>
              </div>
            )}
            {backendConnected === null && (
              <div className="connection-checking">
                <p>🔍 Checking backend connection...</p>
              </div>
            )}
            <label htmlFor="file-upload" className="upload-button">
              Upload File
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            {loading && <p className="loading">Processing file...</p>}
            {error && <p className="error">{error}</p>}
          </div>
        )}

        {campaign && (
          <div className="campaign-section">
            <div className="campaign-header">
              <h2>Campaign #{campaign.id}</h2>
              <button 
                onClick={() => {
                  setCampaign(null);
                  setShowAverageEngagementRate(false);
                  setAverageEngagementRate(null);
                  setSelectedMediaType('all');
                }}
                className="reset-button"
              >
                Upload New Campaign
              </button>
            </div>

            {/* Statistics Summary */}
            <div className="stats-summary">
              <div className="stat-card">
                <h3>Total Followers Gained</h3>
                <p className="stat-value">{stats.totalFollowersGained}</p>
              </div>
              <div className="stat-card">
                <h3>Overall Engagement Rate</h3>
                <p className="stat-value">{stats.overallEngagementRate}%</p>
              </div>
              <div className="stat-card">
                <h3>Best Media Type</h3>
                <p className="stat-value">{stats.bestMediaType}</p>
                <p className="stat-subvalue">({stats.bestMediaTypeRate}% avg)</p>
              </div>
            </div>

            {/* Average Engagement Rate Toggle */}
            <div className="average-section">
              <button
                onClick={handleShowAverageEngagementRate}
                className="average-button"
              >
                {showAverageEngagementRate ? 'Hide' : 'Show'} Average Engagement Rate
              </button>
              {showAverageEngagementRate && averageEngagementRate !== null && (
                <div className="average-display">
                  <h3>Average Engagement Rate: {averageEngagementRate}%</h3>
                </div>
              )}
            </div>

            {/* Media Type Filter */}
            <div className="filter-section">
              <label htmlFor="media-filter">Filter by Media Type: </label>
              <select
                id="media-filter"
                value={selectedMediaType}
                onChange={(e) => setSelectedMediaType(e.target.value)}
                className="filter-select"
              >
                {stats.mediaTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'all' ? 'All Types' : type}
                  </option>
                ))}
              </select>
            </div>

            {/* Campaign Table */}
            <div className="table-container">
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Post ID</th>
                    <th>Engagement Rate</th>
                    <th>Media Type</th>
                    <th>Followers Gained</th>
                    <th>Shares</th>
                    <th>Saves</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map(post => {
                    const isTopEngagement = stats.top5Engagement.includes(post.id);
                    const isTopShares = stats.top5Shares.includes(post.id);
                    
                    let rowClass = '';
                    if (isTopEngagement && isTopShares) {
                      rowClass = 'highlight-both';
                    } else if (isTopEngagement) {
                      rowClass = 'highlight-green';
                    } else if (isTopShares) {
                      rowClass = 'highlight-orange';
                    }

                    return (
                      <tr key={post.id} className={rowClass}>
                        <td>{post.id}</td>
                        <td>{post.engagement_rate.toFixed(4)}%</td>
                        <td>{post.media_type}</td>
                        <td>{post.followers_gained}</td>
                        <td>{post.shares}</td>
                        <td>{post.saves}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="legend">
              <div className="legend-item">
                <span className="legend-color green"></span>
                <span>Top 5 Highest Engagement Rate</span>
              </div>
              <div className="legend-item">
                <span className="legend-color orange"></span>
                <span>Top 5 Highest Shares</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

