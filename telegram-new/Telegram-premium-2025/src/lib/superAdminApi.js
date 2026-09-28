import apiClient from './apiClient';

const BASE_URL = import.meta.env.VITE_API_BASE_URL + '/superadmin';

export const getUsers = async () => {
  const response = await apiClient.get(`${BASE_URL}/users`);
  return response.data;
};

export const createUser = async (userData) => {
  const response = await apiClient.post(`${BASE_URL}/users`, userData);
  return response.data;
};

export const addCredits = async (userId, amount) => {
  const response = await apiClient.post(`${BASE_URL}/users/${userId}/credits`, { amount: parseInt(amount, 10) });
  return response.data;
};
