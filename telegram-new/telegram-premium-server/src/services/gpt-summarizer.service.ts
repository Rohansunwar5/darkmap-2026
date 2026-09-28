import OpenAI from 'openai';
import config from '../config';
import logger from '../utils/logger';

export class GptSummarizerService {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }

    // Strip lone UTF-16 surrogates — an emoji/CJK char cut in half by substring() leaves
    // one, and the OpenAI API rejects it with "400 Invalid body: failed to parse JSON value".
    private _sanitize(s: string): string {
        return String(s ?? '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
    }

    private _getLanguageInstruction(language: string = 'english'): string {
        if (language.toLowerCase() !== 'english') {
            return `\n\nIMPORTANT: Provide the entire analysis in ${language}.`;
        }
        return '';
    }

    private _getComprehensivePromptStructure(): string {
        return `
        Create a unified, comprehensive analysis summary covering (translate if the messages are from language other than English):

        1. Activity Overview: Overall trends, peak activity periods, engagement patterns
        2. Key Topics & Themes: Identify and elaborate on 5-7 main discussion topics
        3. Important Events: Timeline of significant announcements, decisions, or events
        4. User Dynamics: Most influential users, community behaviors, interaction patterns
        5. Textual Pattern Mining :Analyze the linguistic and textual characteristics of the entire conversation rather than summarizing its topics. Identify recurring message templates, repetitive phrasing, commonly used slogans, promotional language, frequent keywords and keyword combinations, slang, jargon, code words, abbreviations, emoji usage and patterns, call-to-action phrases, linguistic obfuscation techniques (such as character substitutions, spacing, Unicode variants, or deliberate misspellings), multilingual usage, and indicators of copy-paste, automated, or scripted messaging. Where possible, include approximate frequencies, recurring templates, and representative examples exactly as they appear in the conversation (translated where necessary while preserving the original wording). Highlight any terminology associated with fraud, cybercrime, cryptocurrency, money laundering, recruitment, gambling, adult services, or other illicit activities. Focus on analyzing the language itself—not the discussion topics—and avoid generic summaries already covered in other sections.
        6. Intelligence Leads: {Do NOT summarize this section.}
        Extract every observable investigative lead exactly as it appears in the conversation.
        This section should function as an intelligence appendix rather than a narrative summary. When extracting indicators, enumerate every observable value. Never summarize, generalize, redact, or replace extracted entities with descriptive text. Preserve all usernames, wallet addresses, domains, links, IDs, phone numbers, payment handles, and other indicators exactly as written.

        Rules
        * List the actual extracted values, not descriptions.
        * Preserve spelling exactly as observed.
        * Deduplicate identical entities.
        * Group related entities together where appropriate.
        * If an entity appears multiple times, mention the frequency when useful.
        * If context exists, explain why the entity is important.
        * If no entities of a category exist, omit that category entirely.
        * Never write generic summaries such as "Several Telegram usernames were observed."
        * Never replace extracted values with descriptions.
        For each extracted entity include:
        * Value
        * Entity Type
        * Associated User(s)
        * Context
        * Investigative Value

        Extract every observable investigative lead without omission. Enumerate all matching entities found in the conversation. mentioned or observed in the conversation. Where possible, group related entities together and explain their investigative value.
        Include, where present (where None observed don't mention those headings) :
        * Telegram usernames and IDs
        * Telegram group/channel names and invite links
        * Cryptocurrency wallet addresses
        * Bank account details
        * UPI IDs and payment handles
        * Payment links
        * Email addresses
        * Phone numbers
        * WhatsApp numbers
        * Signal accounts
        * Discord usernames
        * WeChat IDs
        * X (Twitter), Facebook, Instagram or other social media profiles
        * Domains, websites, URLs and short links
        * GitHub, Pastebin, GitLab or code repositories
        * File sharing links (Mega, Google Drive, Dropbox, etc.)
        * Associated aliases, nicknames and handles
        * Any other identifiable infrastructure or pivot points.

        7. Alias Pivoting (Actor Enumeration)
        8. Financial Intelligence:
        Extract and consolidate all financial intelligence indicators observed throughout the conversation. Do not provide a general summary. Instead, enumerate every financial artifact, transaction indicator, payment mechanism, and monetary relationship identified.

        Extract and organize the following, where present:
        * Cryptocurrency wallet addresses (BTC, ETH, USDT, TRON, Solana, Monero, Litecoin, etc.)
        * Blockchain networks (TRC20, ERC20, BEP20, Polygon, Solana, etc.)
        * Cryptocurrency exchanges (Binance, Bybit, OKX, KuCoin, Coinbase, etc.)
        * Exchange User IDs / Binance IDs / UID numbers
        * Bank account numbers
        * Bank names
        * IFSC, SWIFT, Routing Numbers, IBAN, Sort Codes
        * Beneficiary names
        * UPI IDs and payment handles
        * Mobile payment platforms (PayPal, CashApp, Venmo, Zelle, Wise, Revolut, PIX, Alipay, WeChat Pay, etc.)
        * Payment links and payment gateway URLs
        * Escrow services or escrow providers
        * Gift cards or prepaid card references
        * Debit/Credit card information (only if explicitly present)
        * BIN numbers
        * Virtual bank accounts
        * Merchant accounts
        * QR code payment references (if mentioned)
        * Transaction IDs / Reference numbers
        * Invoice numbers
        * Order IDs
        * Payment confirmations
        * Deposit instructions
        * Withdrawal instructions
        * Cash-out methods
        * Money mule recruitment or bank account rental discussions
        * Commission rates, percentages, profit-sharing models or referral commissions
        * Prices of products or services
        * Subscription fees
        * Minimum order quantities
        * Bulk pricing
        * Negotiated prices
        * Discounts or promotional offers
        * Currency types mentioned (USD, INR, EUR, GBP, USDT, BTC, etc.)
        * Transaction amounts and monetary values
        * Transaction limits (minimum, maximum or daily limits)
        * Payment schedules or deadlines
        * Refund policies
        * Chargeback discussions
        * Financial guarantees or warranties
        * Deposit requirements
        * Financial risk indicators
        * Money laundering indicators
        * Mixing/tumbling services
        * OTC trading references
        * Cross-border payment methods
        For each financial intelligence indicator identified, list the exact value whenever available, identify the associated user(s), alias(es), or entities if known, explain the surrounding context in which the indicator is being used, assess its potential investigative value, and identify any relationships between different financial indicators, such as wallet addresses linked to Telegram usernames, exchange UIDs associated with wallets, or bank accounts connected to specific users or aliases. Remove duplicate entries while preserving all unique financial intelligence, and classify each indicator into an appropriate category, including Cryptocurrency, Banking, Digital Payment, Payment Infrastructure, Commercial Pricing, Transaction Metadata, Money Laundering/Cash-out, Financial Credential, or Other Financial Artifact.

        9. User-to-Alias Relationship Map: Analyze the interaction patterns between participants and identify observable relationships within the conversation. Rather than listing users individually, determine whether users are connected through direct replies, mentions, forwarded messages, quoted messages, conversations, repeated interactions, or frequent engagement with one another. Where possible, identify small groups or clusters of users that regularly interact, reference each other, or participate in the same discussions. Present the relationships in a simple text-based map (e.g., User A ↔ User B ↔ User C) and briefly describe the basis of each connection, such as replying to each other's messages, mentioning one another, forwarding content from the same source, or participating in the same discussion thread. Only include relationships that are explicitly observable from the conversation, and do not infer connections without supporting evidence. If no meaningful interactions exist, state that the conversation primarily consists of independent posts or broadcast-style messages with limited user-to-user engagement. 
        10. Red Flags: Any concerning patterns, suspicious activities, fraud or content requiring attention
        11. Actionable Insights: Specific recommendations based on the analysis
        12. Executive Summary: 3-5 bullet points with the most critical findings
        `;
    }

    private _createSimpleAnalysisPrompt(
        totalMessages: number,
        userActivity: Record<string, any>,
        userSummary: string,
        messageText: string,
        languageInstruction: string
    ): string {
        return `
        Analyze this Telegram channel based on the last ${totalMessages} messages:
        
        TOTAL MESSAGES ANALYZED: ${totalMessages}
        TOTAL UNIQUE USERS: ${Object.keys(userActivity).length}
        
        TOP ACTIVE USERS:
        ${userSummary}
        
        RECENT MESSAGES:
        ${messageText}
        
        Please provide a comprehensive analysis covering (translate if the messages are from language other than English):
        1. Channel Overview (detailed summary)
        2. Most active users and their messages and mention 
        3. Give me Alias Pivoting (Actor Enumeration)
        4. Textual Pattern Mining :Analyze the linguistic and textual characteristics of the entire conversation rather than summarizing its topics. Identify recurring message templates, repetitive phrasing, commonly used slogans, promotional language, frequent keywords and keyword combinations, slang, jargon, code words, abbreviations, emoji usage and patterns, call-to-action phrases, linguistic obfuscation techniques (such as character substitutions, spacing, Unicode variants, or deliberate misspellings), multilingual usage, and indicators of copy-paste, automated, or scripted messaging. Where possible, include approximate frequencies, recurring templates, and representative examples exactly as they appear in the conversation (translated where necessary while preserving the original wording). Highlight any terminology associated with fraud, cybercrime, cryptocurrency, money laundering, recruitment, gambling, adult services, or other illicit activities. Focus on analyzing the language itself—not the discussion topics—and avoid generic summaries already covered in other sections.
        5. Intelligence Leads: {Do NOT summarize this section.}
        Extract every observable investigative lead exactly as it appears in the conversation.
        This section should function as an intelligence appendix rather than a narrative summary. When extracting indicators, enumerate every observable value. Never summarize, generalize, redact, or replace extracted entities with descriptive text. Preserve all usernames, wallet addresses, domains, links, IDs, phone numbers, payment handles, and other indicators exactly as written.

        Rules
        * List the actual extracted values, not descriptions.
        * Preserve spelling exactly as observed.
        * Deduplicate identical entities.
        * Group related entities together where appropriate.
        * If an entity appears multiple times, mention the frequency when useful.
        * If context exists, explain why the entity is important.
        * If no entities of a category exist, omit that category entirely.
        * Never write generic summaries such as "Several Telegram usernames were observed."
        * Never replace extracted values with descriptions.
        For each extracted entity include:
        * Value
        * Entity Type
        * Associated User(s)
        * Context
        * Investigative Value

        Extract every observable investigative lead without omission. Enumerate all matching entities found in the conversation. mentioned or observed in the conversation. Where possible, group related entities together and explain their investigative value.
        Include, where present (where None observed don't mention those headings) :
        * Telegram usernames and IDs
        * Telegram group/channel names and invite links
        * Cryptocurrency wallet addresses
        * Bank account details
        * UPI IDs and payment handles
        * Payment links
        * Email addresses
        * Phone numbers
        * WhatsApp numbers
        * Signal accounts
        * Discord usernames
        * WeChat IDs
        * X (Twitter), Facebook, Instagram or other social media profiles
        * Domains, websites, URLs and short links
        * GitHub, Pastebin, GitLab or code repositories
        * File sharing links (Mega, Google Drive, Dropbox, etc.)
        * Associated aliases, nicknames and handles
        * Any other identifiable infrastructure or pivot points.
                6. Human Trafficking / Adult Scam Connections (if any)
                7. Financial Intelligence: Extract and consolidate all financial intelligence indicators observed throughout the conversation. Do not provide a general summary; instead, enumerate every financial artifact, transaction indicator, payment mechanism, and monetary relationship identified. Include, where present, cryptocurrency wallet addresses, blockchain networks, exchanges and exchange UIDs, bank account details (including bank names, beneficiary names, IFSC, SWIFT, IBAN, routing numbers and sort codes), UPI IDs, payment handles, digital payment platforms, payment links, escrow services, gift cards, card or BIN information, merchant or virtual bank accounts, QR payment references, transaction IDs, invoice or order numbers, payment confirmations, deposit or withdrawal instructions, cash-out methods, money mule recruitment or bank account rental discussions, commission structures, pricing, subscription fees, negotiated prices, discounts, currencies, transaction amounts, payment limits, schedules, refund or chargeback discussions, financial guarantees, money laundering indicators, mixing/tumbling services, OTC trading references, and cross-border payment methods. For each financial indicator, record the exact value whenever available, identify the associated user(s), alias(es), or entities, explain the surrounding context, assess its potential investigative value, and identify relationships between financial indicators (such as wallets linked to Telegram usernames, exchange UIDs, or bank accounts). Remove duplicate entries while preserving all unique financial intelligence, and classify each indicator into an appropriate category, including Cryptocurrency, Banking, Digital Payment, Payment Infrastructure, Commercial Pricing, Transaction Metadata, Money Laundering/Cash-out, Financial Credential, or Other Financial Artifact.
                8. User-to-Alias Relationship Map: Analyze the interaction patterns between participants and identify observable relationships within the conversation. Rather than listing users individually, determine whether users are connected through direct replies, mentions, forwarded messages, quoted messages, conversations, repeated interactions, or frequent engagement with one another. Where possible, identify small groups or clusters of users that regularly interact, reference each other, or participate in the same discussions. Present the relationships in a simple text-based map (e.g., User A ↔ User B ↔ User C) and briefly describe the basis of each connection, such as replying to each other's messages, mentioning one another, forwarding content from the same source, or participating in the same discussion thread. Only include relationships that are explicitly observable from the conversation, and do not infer connections without supporting evidence. If no meaningful interactions exist, state that the conversation primarily consists of independent posts or broadcast-style messages with limited user-to-user engagement. 
                9. Geographic Intelligence:
        Infer the likely geographic footprint of the actors and operation using contextual indicators rather than explicit claims.
        Where possible identify:
        * Likely country or countries of operation
        * Target country or victim geography
        * Primary language(s) used
        * Timezone or approximate operating hours
        * Currency references
        * Banking institutions or payment providers
        * Regional slang, dialect or linguistic indicators
        * Country-specific regulations, services or platforms mentioned
        * Telephone country codes
        * Local payment methods (UPI, PIX, SEPA, ACH, etc.)
        * Crypto exchange preferences associated with particular regions
        Clearly distinguish between:
        * Explicitly confirmed geographic information.
        * AI-inferred geographic indicators.

        10. Key Insights
        ${languageInstruction}
        `;
    }

    async analyzeTelegramGroup(messagesData: any, responseLanguage: string = 'english', analysisType: 'simple' | 'comprehensive' = 'comprehensive'): Promise<any> {
        try {
            const messages = messagesData.messages || [];
            const topUsers = messagesData.top_active_users || [];
            const userActivity = messagesData.user_activity || {};
            const totalMessages = messagesData.total_messages || 0;
            const top50Users = messagesData.top_50_users || [];

            const messageText = this._sanitize(messages.slice(0, 100).map((msg: any) =>
                `[${msg.timestamp}] ${msg.sender}: ${String(msg.text ?? '').substring(0, 300)}`
            ).join('\n\n'));

            const userSummary = topUsers.map((u: any) =>
                `- ${u[0]}: ${u[1]} messages (${(u[1] / totalMessages * 100).toFixed(1)}% of total)`
            ).join('\n');

            const topUsersDetailed = top50Users.map((user: any) =>
                `${user.rank}. ${user.display_name} (${user.telegram_handle}) - ${user.message_count} messages`
            ).join('\n');

            const languageInstruction = this._getLanguageInstruction(responseLanguage);

            let prompt: string;
            if (analysisType === 'simple') {
                prompt = this._createSimpleAnalysisPrompt(totalMessages, userActivity, userSummary, messageText, languageInstruction);
            } else {
                prompt = `
            Analyze this Telegram channel based on the last ${totalMessages} messages:

            TOTAL MESSAGES ANALYZED: ${totalMessages}
            TOTAL UNIQUE USERS: ${Object.keys(userActivity).length}

            TOP ACTIVE USERS:
            ${userSummary}

            TOP 50 USERS WITH TELEGRAM HANDLES:
            ${topUsersDetailed}

            RECENT MESSAGES:
            ${messageText}

            ${this._getComprehensivePromptStructure()}
            ${languageInstruction}
            `;
            }

            const response = await this.client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert analyst specializing in Telegram channel analysis. You can communicate fluently in multiple languages and provide detailed analysis in the requested language.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 16000,
                temperature: 0.7
            });

            return {
                analysis: response.choices[0].message.content?.trim(),
                statistics: {
                    total_messages: totalMessages,
                    unique_users: Object.keys(userActivity).length,
                    top_users: topUsers,
                    messages_per_user: Object.keys(userActivity).length > 0 ? totalMessages / Object.keys(userActivity).length : 0
                },
                top_50_users_list: top50Users,
                response_language: {
                    code: responseLanguage.toLowerCase(),
                    english_name: responseLanguage,
                    native_name: responseLanguage
                }
            };

        } catch (e: any) {
            logger.error(`Error analyzing group: ${e.message}`);
            throw e;
        }
    }

    async summarizeCombinedMessages(allMessages: any[], channelName: string, responseLanguage: string = 'english'): Promise<string> {
        try {
            logger.info(`Processing ${allMessages.length} messages for channel ${channelName}`);

            const messageText = this._sanitize(allMessages.slice(0, 300).map((msg: any) =>
                `[${msg.timestamp}] ${msg.sender}: ${String(msg.text ?? '').substring(0, 200)}`
            ).join('\n\n'));

            const languageInstruction = this._getLanguageInstruction(responseLanguage);
            const prompt = `
            Analyze this Telegram channel "${channelName}" with comprehensive analysis:
            
            CHANNEL STATISTICS:
            - Total messages: ${allMessages.length}
            
            RECENT MESSAGES SAMPLE:
            ${messageText}
            
            ${this._getComprehensivePromptStructure()}
            ${languageInstruction}
            `;

            const response = await this.client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert analyst specializing in comprehensive Telegram channel analysis.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 4000,
                temperature: 0.7
            });

            return response.choices[0].message.content?.trim() || 'No summary generated.';

        } catch (e: any) {
            logger.error(`Error summarizing combined messages: ${e.message}`);
            throw e;
        }
    }
}
