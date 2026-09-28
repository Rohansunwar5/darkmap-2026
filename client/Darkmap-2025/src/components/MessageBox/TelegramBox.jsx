import { useEffect, useState } from "react";
import Telegram from "../../assets/teledark.png";


// import { auth, firestore } from "../../firebase";
// import { doc, getDoc } from "firebase/firestore";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { selectChannelAnalysis, selectChannelAnalysisLoading } from "../../store/selectors/searchSelectors";
import { analyzeTelegramChannel } from "../../store/slices/searchSlice";
import { Dialog, DialogContent, DialogTitle, IconButton, Box, Typography, Divider, Chip, CircularProgress } from "@mui/material";
import { Insights } from "@mui/icons-material";


const fetchUserRole = async () => {
  try {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;

    const response = await axios.get('https://backend.darkmap.org/auth/profile', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const userData = response.data;
    console.log("User role:", userData.role);
    return userData.role;

  } catch (error) {
    console.error("Error fetching user role:", error.message);
    return null;
  }
};

const TelegramMessageBox = ({
  messages = [],
  onSelectMessage,
  searchQuery,
  highlightTerms,
}) => {
  const [preloadedImages, setPreloadedImages] = useState({});
  const [userRole, setUserRole] = useState(null);

  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [currentChannel, setCurrentChannel] = useState(null);

  const dispatch = useDispatch();
  const channelAnalysis = useSelector(selectChannelAnalysis);
  const analysisLoading = useSelector(selectChannelAnalysisLoading);

  const handleAnalyzeChannel = (channelName, e) => {
    e.stopPropagation();
    if (!channelName) return;

    setCurrentChannel(channelName);
    setAnalysisDialogOpen(true);

    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.error('No access token found');
      return;
    }

    setCurrentChannel(channelName);
    setAnalysisDialogOpen(true);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    dispatch(analyzeTelegramChannel({ channel_username: channelName, authHeaders }));
  };

  const closeAnalysisDialog = () => {
    setAnalysisDialogOpen(false);
    setCurrentChannel(null);
  };

  const renderAnalysisContent = () => {
    if (!channelAnalysis) return null;

    return (
      <div>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ color: '#3ac1ff' }}>Channel Statistics</Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Chip
              label={
                <span>
                  <span style={{ color: '#3ac1ff' }}>Total Messages: </span>
                  <span style={{ color: '#ff0000' }}>{channelAnalysis.statistics.total_messages}</span>
                </span>
              }
              sx={{ backgroundColor: 'transparent', border: '1px solid #3ac1ff' }}
            />
            <Chip
              label={
                <span>
                  <span style={{ color: '#3ac1ff' }}>Unique Users: </span>
                  <span style={{ color: '#ff0000' }}>{channelAnalysis.statistics.unique_users}</span>
                </span>
              }
              sx={{ backgroundColor: 'transparent', border: '1px solid #3ac1ff' }}
            />
            <Chip
              label={
                <span>
                  <span style={{ color: '#3ac1ff' }}>Messages/User: </span>
                  <span style={{ color: '#ff0000' }}>{channelAnalysis.statistics.messages_per_user.toFixed(2)}</span>
                </span>
              }
              sx={{ backgroundColor: 'transparent', border: '1px solid #3ac1ff' }}
            />
          </Box>

          <Typography variant="subtitle1" gutterBottom sx={{ color: '#3ac1ff' }}>Top Users:</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {channelAnalysis.statistics.top_users.map(([user, count], index) => (
              <Chip
                key={index}
                label={
                  <span>
                    <span style={{ color: '#3ac1ff' }}>{user}: </span>
                    <span style={{ color: '#ff0000' }}>{count}</span>
                  </span>
                }
                variant="outlined"
                sx={{
                  borderColor: '#3ac1ff',
                  '& .MuiChip-label': {
                    display: 'flex',
                    alignItems: 'center'
                  }
                }}
              />
            ))}
          </Box>
        </Box>

        <Divider sx={{ my: 2, borderColor: '#3ac1ff' }} />

        <Typography variant="h6" gutterBottom sx={{ color: '#3ac1ff', fontSize: '1.25rem' }}>Analysis Summary</Typography>
        <Box
          component="div"
          sx={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            p: 2,
            borderRadius: 1,
            maxHeight: '400px',
            overflowY: 'auto',
            color: '#ffffff',
            fontSize: '1.1rem',
            lineHeight: '1.6',
            '& h3': {
              color: '#3ac1ff',
              fontSize: '1.2rem',
              margin: '16px 0 8px 0'
            },
            '& strong': {
              color: '#ff0000'
            },
            '& li': {
              marginLeft: '20px'
            }
          }}
          dangerouslySetInnerHTML={{ __html: formatAnalysisText(channelAnalysis.analysis) }}
        />
      </div>
    );
  };

  const formatAnalysisText = (text) => {
    // Convert markdown-style headers to HTML
    return text
      .replace(/### (.*?)\n/g, '<h3 style="margin: 16px 0 8px 0; color: #3ac1ff;">$1</h3>')
      .replace(/- (.*?)\n/g, '<li style="margin-left: 20px;">$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');
  };

  // Function to generate fake channel names for premium content
  const generateFakeChannelName = (index) => {
    const fakeNames = [
      "Premium_channel",
    ];
    return fakeNames[index % fakeNames.length];
  };

  // Function to check if channel name is empty or just whitespace
  const isChannelNameEmpty = (channelName) => {
    return !channelName || channelName.trim() === "";
  };

  useEffect(() => {
    const preloadImages = () => {
      const newPreloadedImages = {};
      messages.forEach((message, index) => {
        let telegramPath = message.channel_name;
        if (message.message_id) {
          telegramPath = `${message.channel_name}/${message.message_id}`;
        } else if (message.link && message.link.includes("t.me/")) {
          const urlParts = message.link.split("t.me/");
          if (urlParts.length > 1) {
            telegramPath = urlParts[1];
            if (telegramPath.startsWith("s/")) {
              telegramPath = telegramPath.substring(2);
            }
          }
        }

        let truncatedText = searchQuery;

        const imageUrl = `https://screenshot.darkmap.org/screenshot?url=https://t.me/s/${telegramPath}${truncatedText ? `?q=${truncatedText}` : ""}`;
        const img = new Image();
        img.src = imageUrl;
        newPreloadedImages[`${message.channel_name}_${index}`] = imageUrl;
      });
      setPreloadedImages(newPreloadedImages);
    };

    preloadImages();
  }, [messages, searchQuery]);

  useEffect(() => {
    const checkRole = async () => {
      const role = await fetchUserRole();
      setUserRole(role);
    }
    checkRole();
  }, []);

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /**
   * Crop a window around the match and highlight every term.
   *
   * It used to take a single query, window +/-10 words around its FIRST
   * occurrence, and highlight only that. With an advanced search the query is
   * the base term ("apk") while the interesting keyword ("SBI") sits elsewhere
   * in the message - so the snippet was cropped around "apk" and the keyword
   * was cut out of the visible text, making it look like the keyword had been
   * ignored. Now the window centres on whichever term appears first and all of
   * them are highlighted.
   */
  const highlightQueryInText = (text, query) => {
    if (!text) return truncateToFirst20Words(text);

    const terms = (highlightTerms && highlightTerms.length ? highlightTerms : [query])
      .filter(t => t && String(t).trim())
      .map(String);
    if (!terms.length) return truncateToFirst20Words(text);

    const lower = text.toLowerCase();
    // Prefer an include keyword over the base term: it is the more specific
    // reason this message is on screen.
    const found = terms
      .map(t => ({ term: t, at: lower.indexOf(t.toLowerCase()) }))
      .filter(h => h.at !== -1);
    if (!found.length) return truncateToFirst20Words(text);

    const anchor = found.length > 1
      ? found.slice(1).reduce((a, b) => (a.at <= b.at ? a : b))
      : found[0];

    const wordsBefore = text.slice(0, anchor.at).split(" ");
    const wordsAfter = text.slice(anchor.at + anchor.term.length).split(" ");

    const windowed =
      (wordsBefore.length > 10 ? "..." : "") +
      wordsBefore.slice(-10).join(" ") +
      " " +
      text.slice(anchor.at, anchor.at + anchor.term.length) +
      " " +
      wordsAfter.slice(0, 10).join(" ") +
      (wordsAfter.length > 10 ? "..." : "");

    // Escape first: message text is untrusted and goes through innerHTML.
    const pattern = terms.map(escapeRegex).sort((a, b) => b.length - a.length).join("|");
    return escapeHtml(windowed).replace(
      new RegExp(`(${pattern})`, "gi"),
      `<span style="background-color: #00316B;">$1</span>`
    );
  };

  const truncateToFirst20Words = (text) => {
    const words = text.split(" ");
    return words.length > 20
      ? words.slice(0, 20).join(" ") + "..."
      : words.join(" ");
  };

  const truncateToFirst2Words = (text) => {
    const words = text.split(" ");
    return words.length > 0 ? words.slice(0, 2).join(" ") : words.join(" ");
  };

  return (
    <div className="overflow-x-hidden overflow-y-auto">
      {messages.map((message, index) => {
        const isPremiumContent = isChannelNameEmpty(message.channel_name);
        const displayChannelName = isPremiumContent
          ? generateFakeChannelName(index)
          : message.channel_name;

        return (
          <div
            key={index}
            className="w-[77%] bg-transparent shadow-[0_2px_11px_0_#3ac1ff] ml-[20%] overflow-x-hidden box-border"
            style={{
              border: "1.8px solid #3ac1ff",
              maxWidth: "100%",
              marginTop: "19px",
            }}
            onClick={() =>
              onSelectMessage(
                message,
                preloadedImages[`${message.channel_name}_${index}`],
                searchQuery
              )
            }
          >
            <div className="p-1.5 bg-[#04121ae5]">
              <div
                className="flex items-center font-bebas-neue gap-0.5 text-white"
                style={{
                  paddingBottom: "0px",
                  fontSize: "28px",
                  margin: "0px 5px ",
                }}
              >
                Source
                <img src={Telegram} alt="" className="w-7 h-auto ml-1" />
                <span
                  className="font-[Aldrich] text-[#a0ddff] mx-1.5 mb-[1.5px]"
                  style={{ fontSize: "23px" }}
                >
                  Telegram
                </span>
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich]"
                style={{
                  fontSize: "12px",
                  marginLeft: "5px",
                  margin: "0px 5px",
                }}
              >
                Date : {new Date(message.date).toLocaleDateString("en-GB")} Time :{" "}
                {new Date(message.date).toLocaleTimeString()}
              </div>
              <div
                className="text-[#dfd5d5] font-[Aldrich] pt-[2px]"
                style={{ margin: "2px 5px", fontSize: "13px" }}
              >
                <span
                  className="bg-[#ede4e4] rounded text-black"
                  style={{ padding: "0px 0.6px 1px 0.6px", marginRight: "4px" }}
                >
                  person
                </span>
                sent a message on
                <span
                  className={
                    userRole === "test" || isPremiumContent
                      ? "normal-class text-[#ff0000]"
                      : "premium-class text-[#ff0000]"
                  }
                  style={{
                    filter: isPremiumContent ? "blur(1px)" : "none",
                    textShadow: isPremiumContent ? "0 0 3px #ff0000" : "none",
                    opacity: isPremiumContent ? 0.8 : 1,
                  }}
                >
                  {displayChannelName}
                  {isPremiumContent && (
                    <span
                      className="ml-1 text-xs"
                      style={{
                        color: "#ff6b6b",
                        filter: "none",
                        opacity: 1
                      }}
                    >
                      🔒
                    </span>
                  )}
                </span>
                {!isPremiumContent && message.channel_name && (
                  <button
                    onClick={(e) => handleAnalyzeChannel(message.channel_name, e)}
                    style={{
                      marginLeft: "8px",
                      color: "#3ac1ff",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: "12px"
                    }}
                    title="Analyze channel with AI"
                  >
                    <Insights style={{ fontSize: "16px", marginRight: "4px" }} />
                    Analyze
                  </button>
                )}
              </div>
              <div
                className="font-chakra text-white"
                style={{
                  margin: "25px 5px",
                  fontSize: "14px",
                }}
                dangerouslySetInnerHTML={{
                  __html: highlightQueryInText(message.text, searchQuery),
                }}
              />
            </div>
          </div>
        );
      })}
      <Dialog
        open={analysisDialogOpen}
        onClose={closeAnalysisDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          style: {
            backgroundColor: '#04121ae5',
            color: 'white',
            border: '1px solid #3ac1ff'
          }
        }}
      >
        <DialogTitle style={{ display: 'flex', alignItems: 'center' }}>
          <Insights style={{ marginRight: '8px', color: '#3ac1ff' }} />
          <span style={{ color: '#3ac1ff' }}>AI Channel Analysis:</span> {currentChannel}
        </DialogTitle>
        <DialogContent dividers>
          {analysisLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress style={{ color: '#3ac1ff' }} />
              <Typography variant="body1" style={{ marginLeft: '16px' }}>
                Analyzing channel data...
              </Typography>
            </Box>
          ) : channelAnalysis ? (
            renderAnalysisContent()
          ) : (
            <Typography>No analysis available for this channel.</Typography>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TelegramMessageBox;