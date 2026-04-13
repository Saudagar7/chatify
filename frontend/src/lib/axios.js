import axios from 'axios';

const resolveApiBaseUrl = () => {
    if (import.meta.env.MODE !== "development") return "/api";

    const envServerUrl = import.meta.env.VITE_SERVER_URL?.replace(/\/$/, "");
    if (envServerUrl) return `${envServerUrl}/api`;

    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    return `http://${host}:3000/api`;
};

export const axiosInstance = axios.create({
    baseURL: resolveApiBaseUrl(),
    withCredentials: true,
});