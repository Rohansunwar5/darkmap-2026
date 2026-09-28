import { useState } from 'react';
import apiClient from '../lib/apiClient';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLink } from '@fortawesome/free-solid-svg-icons';
import Dropdown from "./Common/dropdown.jsx";
import { exportExcel } from "./Common/utils.jsx";

const Results = ({ totalResultsCount, shuffleBoxes, onFilterChange, searchResults, setNearbyData, socialProfiles }) => {

  const [exporting, setExporting] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isNearbyLoading, setIsNearbyLoading] = useState(false);
  const [showNearbyModal, setShowNearbyModal] = useState(false);

  const handleExportClick = async (mode) => {
    setExporting(true)
    if(mode == 'PDF'){
      await generatePdf(searchResults, socialProfiles)
    }
    else{
      const history_sheet = [['Date', 'Username']];
      const usernameHistory = searchResults.telegram.result.username_history || [];
      usernameHistory.forEach(entry => {
        const handle = entry.username || entry.text || '';
        const date = entry.date || entry.date_updated || entry.updated_at || '';
        if (handle) history_sheet.push([date, handle]);
      })
      const queryName = searchResults.telegram.result.user.username || searchResults.telegram.result.user.id || 'N/A';
      const telegramId = searchResults.telegram.result.user.id || 'N/A';
      const groups_sheet = [
        [`Telegram User: ${queryName}`],
        [`Telegram ID: ${telegramId}`],
        [],
        ['Title', 'Link', 'ID', 'Last Updated']
      ];
      searchResults.telegram.result.groups.forEach(group => {
        const link = group.link || (group.username ? `https://telegram.me/${group.username}` : '');
        const updatedLink = typeof link === 'string' ? link.replace(/t\.me/g, 'telegram.me') : link;
        groups_sheet.push([group.title, updatedLink, group.id?.toString() || '', group.date_updated])
      })
      
      const social_sheet = [
        [`Telegram User: ${queryName}`],
        [`Telegram ID: ${telegramId}`],
        [],
        ['Platform', 'URL']
      ];
      if (socialProfiles && socialProfiles.length > 0) {
        socialProfiles.forEach(profile => {
          social_sheet.push([profile.site || 'Unknown', profile.url || '']);
        });
      } else {
        social_sheet.push(['No social media links found', '']);
      }

      exportExcel({
        'Groups': groups_sheet, 
        'Username History': history_sheet,
        'Social Links': social_sheet
      }, `${searchResults.telegram.result.user.username || 'telegram'}-groups`)
    }
    setExporting(false)
  };

  const handleNearbyProceed = async () => {
    if (isNearbyLoading) return;

    setShowNearbyModal(false);
    setIsNearbyLoading(true);
    
    try {
      const targetQuery = searchResults?.telegram?.result?.user?.username || searchResults?.telegram?.result?.user?.id;
      
      if (!targetQuery) {
        throw new Error('No user target to search');
      }

      const response = await apiClient.post(
        `${import.meta.env.VITE_API_BASE_URL}/bkpsch/searchNearby`,
        { query: String(targetQuery) }
      );

      if (response.data?.result) {
        if (setNearbyData) {
          // Include triesLeft in the nearby data
          setNearbyData({
            ...response.data.result,
            triesLeft: response.data.triesLeft || 15,
          });
        }
      }
    } catch (error) {
      console.error("Explore Nearby error:", error);
      
      let errorMessage = "An error occurred. Check credits or try again.";
      
      // Handle monthly limit exceeded error
      if (error.response?.status === 429) {
        errorMessage = error.response?.data?.message || "You have reached your monthly limit of 15 clicks for this button. Try again next month.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      alert(errorMessage);
    } finally {
      setIsNearbyLoading(false);
    }
  };

  return (
    <div
      className="pe-5 flex justify-between items-center text-white font-[Aldrich]"
      style={{
        marginTop: "5px",
      }}
    >
      {/* Results Section */}
      <div className="relative inline-block px-10">
        <button
          className="relative bg-transparent text-white border-none cursor-pointer flex items-center font-[Aldrich]"
          style={{
            padding: "20px 5px",
            fontSize: "20.8px",
          }}
        >
          Results Found:{" "}
          <span className="text-[#A0DDFF]">
            {" "}
            ‎ {totalResultsCount > 0 ? totalResultsCount : "N/A"}
          </span>
        </button>
      </div>

      {/* Filter and Export Section */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setShowComingSoon(true)}
          className="flex items-center gap-2 bg-[#0094FF1C] border border-[#126382] text-[#A0DDFF] px-2 py-1.5 rounded cursor-pointer hover:bg-[#0094ff3b] transition-colors h-[32px]"
          style={{ fontSize: "11px" }}
        >
          <FontAwesomeIcon icon={faLink} />
          Connected Users
        </button>
        
        {Boolean(searchResults?.telegram?.result) && exporting == true ? (
          <div className='text-xs'>Exporting...</div> 
        ) : (
          <Dropdown items={['Excel', 'PDF']} onChange={handleExportClick} getLabel={(label) => `Export (${label})`} placeholder="Export" width="w-40" value={null}></Dropdown>
        )}
      </div>

      {/* Credit Confirmation Modal */}
      {showNearbyModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] bg-black bg-opacity-80 backdrop-filter backdrop-blur-sm">
          <div style={{ backgroundColor: 'rgb(12,12,12)' }} className="p-6 rounded-lg shadow-xl max-w-sm border border-[#126382] text-center">
            <h3 className="text-[#00D1FF] font-medium text-xl mb-4">Connected Users</h3>
            <p className="text-gray-300 text-sm mb-6 font-sans">
              This action will consume <span className="text-[#00D1FF] font-bold">1 credit</span>.<br/>Do you want to proceed?
            </p>
            <div className="flex justify-center gap-4">
              <button 
                onClick={() => setShowNearbyModal(false)}
                className="px-4 py-2 border border-gray-600 rounded text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleNearbyProceed}
                disabled={isNearbyLoading}
                className="px-4 py-2 bg-[#126382] text-white rounded hover:bg-[#0f4d66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isNearbyLoading ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coming Soon Popup */}
      {showComingSoon && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] bg-black bg-opacity-80 backdrop-filter backdrop-blur-sm">
          <div style={{ backgroundColor: 'rgb(12,12,12)' }} className="p-6 rounded-lg shadow-xl max-w-sm border border-[#126382] text-center">
            <h3 className="text-[#00D1FF] font-medium text-xl mb-4">Coming Soon</h3>
            <p className="text-gray-300 text-sm mb-6 font-sans">
              The Connected Users feature will be available soon.
            </p>
            <div className="flex justify-center gap-4">
              <button 
                onClick={() => setShowComingSoon(false)}
                className="px-4 py-2 bg-[#00adf0] text-white rounded hover:bg-[#0088bb] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Results;

export async function generatePdf(searchBarResults, socialProfiles) {
  const jsPDF = (await import('jspdf')).jsPDF;
  
  const doc = new jsPDF();
  const margin = 10;
  const topMargin = 20;
  const rowHeight = 10;
  const cellPadding = 3;
  const fontSize = 10;
  const textColor = (0, 0, 0)
  const user = searchBarResults.telegram.result.user;
  const usernameHistory = searchBarResults.telegram.result.username_history;
  const groups = searchBarResults.telegram.result.groups;

  doc.setFontSize(fontSize);

  await import('../constants/Symbola-normal.js');
  doc.setFont("Symbola");

  let y = topMargin;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.addImage('/logo.png', 'PNG', pageWidth - 20, 10, 20, 20);
  doc.addImage('/logo_text.png', 'PNG', pageWidth - 25, 30, 30, 7);


  const addText = (text, x = margin, newLine = true) => {
    doc.text(String(text), x, y);
    if (newLine) y += rowHeight;
  };

  // 1. Add User Info & Username History
  addText(`Telegram User: @${user.username || 'N/A'} (ID: ${user.id})`);

  if (usernameHistory.length > 0) {
    addText('Username History:');
    usernameHistory.forEach(entry => {
      const handle = entry.username || entry.text || '';
      if (handle) addText(`- ${handle}`, margin + 5);
    });
  } else {
    addText('No username history available.');
  }

  y += rowHeight;

  // 2. Define Headers and Column Widths
  const headers = {
    'Title': 0.4,
    'Link': 0.3,
    'ID': 0.15,
    'Last Updated': 0.15
  };

  const headerKeys = Object.keys(headers);
  const colWidths = headerKeys.map(key => headers[key] * pageWidth);

  // 3. Prepare Rows
  const rows = groups.map(g => [
    g.title,
    g.username || '',
    String(g.id),
    g.date_updated
  ]);

  // --- CJK helpers ---
  const containsCJK = (text) =>
    /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u3400-\u4dbf]/.test(text);

  // Render CJK text on a browser canvas (which has system CJK fonts) and return a data-URL image
  const renderCJKToImage = (text, maxWidthPt, fontSizePt) => {
    const scale = 4; // render at 4× for high-res crisp PDF output
    const cjkFont = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "SimHei", "WenQuanYi Micro Hei", sans-serif';
    const canvasFontSize = fontSizePt * scale * 0.4; // 0.4 to make CJK characters look visually balanced

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${canvasFontSize}px ${cjkFont}`;

    // Word-wrap character by character
    const chars = Array.from(text);
    const lines = [];
    let currentLine = '';
    const maxWidthPx = maxWidthPt * scale;

    for (const ch of chars) {
      const testLine = currentLine + ch;
      if (ctx.measureText(testLine).width > maxWidthPx && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = ch;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeightPx = canvasFontSize * 1.25;
    canvas.width  = Math.ceil(maxWidthPx);
    canvas.height = Math.ceil(lines.length * lineHeightPx + canvasFontSize * 0.2);

    // Must re-set after resize
    ctx.font = `${canvasFontSize}px ${cjkFont}`;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 0, i * lineHeightPx));

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthPt: maxWidthPt,
      heightPt: canvas.height / scale,
      lineCount: lines.length,
    };
  };

  // --- drawRow (CJK-aware) ---
  const drawRow = (cells, isHeader = false) => {
    const lineHeight = 5;
    let x = margin;

    // Pre-process each cell: either text lines or a canvas image
    const cellData = cells.map((text, i) => {
      const availableWidth = colWidths[i] - 2 * cellPadding;
      const safeText = String(text || '');

      // Title column (i===0), not a header, contains CJK → use canvas image
      if (i === 0 && !isHeader && containsCJK(safeText)) {
        const img = renderCJKToImage(safeText, availableWidth, fontSize);
        return { type: 'image', img, lineCount: img.lineCount };
      }
      const lines = splitSmart(doc, safeText, availableWidth);
      return { type: 'text', lines, lineCount: lines.length };
    });

    // Calculate row height from tallest cell
    const computedRowHeight = Math.max(
      ...cellData.map(d =>
        d.type === 'image'
          ? d.img.heightPt + cellPadding
          : (d.lineCount * lineHeight) + cellPadding
      )
    );

    // Page break
    if (y + computedRowHeight > pageHeight - margin) {
      doc.addPage();
      y = topMargin;
      drawRow(headerKeys);
    }

    // Render each cell
    cells.forEach((_, i) => {
      const width = colWidths[i];
      const data = cellData[i];
      doc.rect(x, y, width, computedRowHeight);

      const textX = x + cellPadding;
      const textY = y + lineHeight;

      if (data.type === 'image') {
        // CJK rendered via canvas
        doc.addImage(data.img.dataUrl, 'PNG', textX, y + cellPadding / 2, data.img.widthPt, data.img.heightPt);
      } else if (i === 1 && !isHeader) {
        // Link column
        const text = data.lines.join('');
        const displayText = `telegram.me/${text}`;
        const textWidth = doc.getTextWidth(displayText);

        doc.setTextColor(0, 0, 255);
        doc.setDrawColor(0, 0, 255);
        doc.setLineWidth(0.3);

        doc.textWithLink(displayText, textX, textY, { url: `https://telegram.me/${text}` });
        doc.line(textX, textY + 1, textX + textWidth, textY + 1);
      } else {
        data.lines.forEach((line, j) => {
          doc.text(line, textX, textY + j * lineHeight);
        });
      }

      doc.setTextColor(textColor);
      doc.setDrawColor(textColor);
      x += width;
    });

    y += computedRowHeight;
  };


  // 4. Draw Header Row
  if (y + rowHeight > pageHeight - margin) {
    doc.addPage();
    y = topMargin;
  }
  drawRow(headerKeys, true);

  // 5. Draw Table Rows with Pagination
  for (let i = 0; i < rows.length; i++) {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = topMargin;
      drawRow(headerKeys);
    }
    drawRow(rows[i]);
  }

  // 6. Draw Social Media Profiles
  y += rowHeight;
  if (y + rowHeight > pageHeight - margin) {
    doc.addPage();
    y = topMargin;
  }
  
  addText('Social Media Links:', margin, true);
  y += 5;
  
  const socialHeaders = {
    'Platform': 0.3,
    'URL': 0.7
  };
  const socialHeaderKeys = Object.keys(socialHeaders);
  const socialColWidths = socialHeaderKeys.map(key => socialHeaders[key] * pageWidth);

  const drawSocialRow = (cells, isHeader = false) => {
    const lineHeight = 5;
    let x = margin;

    const cellLines = cells.map((text, i) => {
      const availableWidth = socialColWidths[i] - 2 * cellPadding;
      const safeText = String(text || '');
      return splitSmart(doc, safeText, availableWidth, fontSize);
    });

    const maxLines = Math.max(...cellLines.map(lines => lines.length));
    const computedRowHeight = (maxLines * lineHeight) + cellPadding;

    if (y + computedRowHeight > pageHeight - margin) {
      doc.addPage();
      y = topMargin;
      drawSocialRow(socialHeaderKeys, true);
    }

    cells.forEach((_, i) => {
      const width = socialColWidths[i];
      const lines = cellLines[i];
      doc.rect(x, y, width, computedRowHeight);

      const textX = x + cellPadding;
      const textY = y + lineHeight;

      if (i === 1 && !isHeader) {
        const fullUrl = cells[i] || '';
        
        doc.setTextColor(0, 0, 255);
        doc.setDrawColor(0, 0, 255);
        doc.setLineWidth(0.3);

        lines.forEach((line, j) => {
          const lineY = textY + j * lineHeight;
          doc.textWithLink(line, textX, lineY, { url: fullUrl });
          const lineWidth = doc.getTextWidth(line);
          doc.line(textX, lineY + 1, textX + lineWidth, lineY + 1);
        });
      } else {
        lines.forEach((line, j) => {
          doc.text(line, textX, textY + j * lineHeight);
        });
      }

      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      x += width;
    });

    y += computedRowHeight;
  };

  drawSocialRow(socialHeaderKeys, true);

  if (socialProfiles && socialProfiles.length > 0) {
    socialProfiles.forEach(profile => {
      drawSocialRow([profile.site || 'Unknown', profile.url || '']);
    });
  } else {
    drawSocialRow(['No social media links found', '']);
  }

  doc.save(`${user.username || 'telegram'}-groups.pdf`);
}

function containsCJK(text) {
  return /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\u3400-\u4dbf]/.test(text);
}

function splitSmart(doc, text, maxWidth, fontSize = 10) {
  doc.setFontSize(fontSize);

  const finalLines = [];
  const chars = Array.from(text);
  
  let currentChunk = '';
  let currentWidth = 0;

  for (const char of chars) {
    const isCJK = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(char);
    const charWidth = isCJK ? (fontSize * 1.0) : (doc.getTextWidth(char) || (fontSize * 0.5));

    if (currentWidth + charWidth > maxWidth && currentChunk.length > 0) {
      finalLines.push(currentChunk);
      currentChunk = char;
      currentWidth = charWidth;
    } else {
      currentChunk += char;
      currentWidth += charWidth;
    }
  }
  
  if (currentChunk) {
    finalLines.push(currentChunk);
  }

  return finalLines;
}
