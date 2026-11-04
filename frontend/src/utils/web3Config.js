import { ethers } from 'ethers';
import EscrowABI from '../EscrowABI.json';

// Lấy biến môi trường từ file .env của frontend
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
export const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS?.toLowerCase();

export const getEscrowContract = async () => {
    if (!window.ethereum) throw new Error("Vui lòng cài đặt MetaMask!");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);
    return contract;
};