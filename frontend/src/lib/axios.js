import axios from 'axios';

export const axiosInstance = axios.create({
    baseURL: import.meta.env.MODE === "development" ? "https://1m3mrrh5-3000.inc1.devtunnels.ms/api" : "/api",
    withCredentials: true,
});