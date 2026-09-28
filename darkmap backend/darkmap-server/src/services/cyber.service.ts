import axios from 'axios';
import { InternalServerError } from '../errors/internal-server.error';

class CyberService {
    async ransomwareSearch(query: string) {
        const response = await axios.get(
            `https://ransome.darkmap.org/api/cyberattacks?query=${encodeURIComponent(query)}`
        );
        if (response.status !== 200) {
            throw new InternalServerError('Failed to fetch ransomware data');
        }
        return response.data;
    }

    async darkwebSearch(query: string) {
        const response = await axios.get(
            `https://db.darkmap.org/search?query=${encodeURIComponent(query)}`
        );
        if (response.status !== 200) {
            throw new InternalServerError('Failed to fetch darkweb data');
        }
        return response.data;
    }

    async breachforumsSearch(query: string, pages: number = 5) {
        const response = await axios.get(
            `https://breachf.darkmap.org/scrape?query=${encodeURIComponent(query)}&pages=${pages}`
        );
        if (response.status !== 200) {
            throw new InternalServerError('Failed to fetch breachforums data');
        }
        return response.data;
    }

    async hackcheckSearch(query: string) {
        const response = await axios.get(
            `https://hack.darkmap.org/proxy?search_query=${encodeURIComponent(query)}`
        ).catch(() => ({ data: [] }));
        // Always return data (empty array on error)
        return response.data;
    }
}

export default new CyberService();