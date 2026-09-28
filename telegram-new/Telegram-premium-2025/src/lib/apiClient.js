import axios from 'axios';

// Single axios instance for all calls to OUR backend (VITE_API_BASE_URL).
// The request interceptor is the ONE place the auth token is read, so a later
// move to HttpOnly cookies becomes a one-file change (drop the header, add
// `withCredentials: true`).
//
// IMPORTANT: calls to external services (darkmap.org subdomains, AWS, the admin
// `sessionStorage` token scheme, etc.) must keep using raw `axios` — never this
// client — so the user's JWT is never attached to a third party.
const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
