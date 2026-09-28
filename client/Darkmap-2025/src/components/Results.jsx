import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faSearch, faCaretDown, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { SvgSpinnersBlocksShuffle3 } from "./Randombutton";
import { useSearch } from "../contexts/SearchContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import image1 from '../assets/logo_gen.png'

const Results = ({ totalResultsCount, shuffleBoxes, onFilterChange, onSearch, searchResults }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showSearchMenu, setShowSearchMenu] = useState(false);
  const { MenuSearchQuery, MenuSetSearchQuery } = useSearch();
  const dropdownRef = useRef(null);
  const subMenuRef = useRef(null);
  const searchMenuRef = useRef(null);
  const timeoutRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

const parseDarkwebContent = (content) => {
  try {

    let cleanedContent = content;

    const lastBraceIndex = content.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      cleanedContent = content.substring(0, lastBraceIndex + 1);
    }

    cleanedContent = cleanedContent.trim();

    const parsed = JSON.parse(cleanedContent);
    
    return {
      date: parsed['Detection Date'] || parsed['Date'] || parsed.date || 'N/A',
      author: parsed.Author || parsed.author || parsed.Source || 'N/A',
      content: parsed.Content || parsed.content || parsed.Message || 'N/A',
      source: parsed.Source || 'N/A',
      type: parsed.Type || 'N/A'
    };
    
  } catch (e) {
    console.error("Failed to parse darkweb content:", e);
    console.error("Content that failed:", content);
    
    try {
      const result = {};
      
      const patterns = [
        /"([^"]+)":\s*"([^"]*)"/g,  // Standard JSON format
        /(\w+):\s*"([^"]*)"/g,      // Without quotes around keys
        /"([^"]+)":\s*([^,}\n]+)/g  // Values without quotes
      ];
      
      for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0; 
        
        while ((match = pattern.exec(content)) !== null) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^"|"$/g, ''); 
          result[key] = value;
        }
      }
      
      return {
        date: result['Detection Date'] || result['Date'] || result.date || 'N/A',
        author: result.Author || result.author || result.Source || 'N/A',
        content: result.Content || result.content || result.Message || content.substring(0, 100) + '...',
        source: result.Source || 'N/A',
        type: result.Type || 'N/A'
      };
      
    } catch (regexError) {
      console.error("Regex parsing also failed:", regexError);
      
      return {
        date: 'N/A',
        author: 'N/A',
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        source: 'N/A',
        type: 'N/A'
      };
    }
  }
};

const getDisplayName = (type) => {
  const displayNames = {
    breachforums: 'BREACHFORUMS',
    darkweb: 'DARKWEB',
    hackcheck: 'LEAKED CREDENTIALS',
    ransomware: 'RANSOMWARE',
    telegram: 'TELEGRAM'
  };
  return displayNames[type] || type.toUpperCase();
};

const handleExportClick = async () => {
  setIsExporting(true);
  try {
    const doc = new jsPDF({
      orientation: 'landscape'
    });

   
    const logoUrl = image1;
    const logoWidth = 15;
    const logoHeight = 17;
    
    
    const addLogoToPage = (isFirstPage = false) => {
      try {
        if (isFirstPage) {
          
          const pageWidth = doc.internal.pageSize.getWidth();
          const middleX = (pageWidth - logoWidth) / 2;
          const rightX = pageWidth - logoWidth - 14;
          
         
          doc.addImage(logoUrl, 'PNG', middleX, 5, logoWidth, logoHeight);
          doc.addImage(logoUrl, 'PNG', rightX, 5, logoWidth, logoHeight);
        } else {

          const pageWidth = doc.internal.pageSize.getWidth();
          const rightX = pageWidth - logoWidth - 14;
          doc.addImage(logoUrl, 'PNG', rightX, 5, logoWidth, logoHeight);
        }
      } catch (error) {
        console.warn('Could not add logo to PDF:', error);
      }
    };

    
    addLogoToPage(true);

    doc.setFontSize(16);
    doc.text("Cyber Threat Intelligence Report", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Exported on: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total Results: ${totalResultsCount}`, 14, 36);
    
    let yPosition = 45;
    let isFirstPage = true;

    const columnConfig = {
      breachforums: [40, 60, 80], // Title, Link, Description
      darkweb: [30, 30, 110], // Date, Author, Content
      hackcheck: [40, 30, 30, 30, 30], // Email, Username, Password, Source, Date
      ransomware: [40, 30, 30, 30, 80], // Victim, Group, Country, Date, Description
      telegram: [40, 30, 100] // Channel, Date, Message
    };

    Object.entries(searchResults).forEach(([type, results]) => {
      if (!results || (Array.isArray(results) && results.length === 0)) return;

      const items = Array.isArray(results) ? results : 
                   results.results ? results.results : [];

      if (items.length === 0) return;

      doc.setFontSize(12);
      doc.text(`${getDisplayName(type)} (${items.length} items)`, 14, yPosition);
      yPosition += 8;

      const tableData = items.map(item => {
        switch (type) {
          case 'breachforums':
            return [
              item.title || 'N/A',
              item.link || 'N/A',
              item.description || 'N/A'
            ];
          
          case 'darkweb':
            const parsed = parseDarkwebContent(item.content);
            return [
              parsed.date !== 'N/A' ? 
                (parsed.date.includes('T') ? new Date(parsed.date).toLocaleString() : parsed.date) : 
                'N/A',
              parsed.author,
              parsed.content
          ];
          
          case 'hackcheck':
            return [
              item.email || 'N/A',
              item.username || 'N/A',
              item.password || 'N/A',
              item.source?.name || 'N/A',
              item.source?.date || 'N/A'
            ];
          
          case 'ransomware':
            return [
              item.victim || 'N/A',
              item.group || 'N/A',
              item.country || 'N/A',
              item.attackdate || 'N/A',
              item.description || 'N/A'
            ];
          
          case 'telegram':
            return [
              item.channel_name || 'N/A',
              item.date ? new Date(item.date).toLocaleDateString() : 'N/A',
              item.text || 'N/A'
            ];
          
          default:
            return Array(columnConfig.default?.length || 3).fill('N/A');
        }
      });


      const headers = type === 'darkweb' 
        ? ['Date', 'Author', 'Content']
        : getHeadersForType(type);

      autoTable(doc, {
        startY: yPosition,
        head: [headers],
        body: tableData,
        columnStyles: getColumnStyles(type, columnConfig),
        styles: {
          fontSize: 8,
          cellPadding: 3,
          overflow: 'linebreak',
          lineWidth: 0.1,
          valign: 'middle'
        },
        margin: { horizontal: 14 },
        tableWidth: 'wrap',
        showHead: 'everyPage',
        pageBreak: 'auto',
        didDrawPage: (data) => {
          if (data.pageNumber > 1 || !isFirstPage) {
            addLogoToPage(false);
          }
          yPosition = 30;
        },
        didParseCell: (data) => {
          if (data.section === 'body' && (data.column.dataKey === 'Content' || data.column.dataKey === 'Description')) {
            const lines = doc.splitTextToSize(data.cell.raw, data.cell.width - 4);
            data.row.height = Math.max(data.row.height, lines.length * 5);
          }
        }
      });

      isFirstPage = false;

      yPosition = doc.lastAutoTable.finalY + 10;
    });

    doc.save('threat-intel-report.pdf');
  } catch (error) {
    console.error("Export failed:", error);
  } finally {
    setIsExporting(false);
  }
};


function getHeadersForType(type) {
  const headers = {
    breachforums: ['Title', 'Link', 'Description'],
    darkweb: ['Date', 'Author', 'Content'], // Only these 3 headers now
    hackcheck: ['Email', 'Username', 'Password', 'Source', 'Date'],
    ransomware: ['Victim', 'Group', 'Country', 'Date', 'Description'],
    telegram: ['Channel', 'Date', 'Message']
  };
  return headers[type] || [];
}

function getColumnStyles(type, config) {
  const styles = {};
  config[type]?.forEach((width, index) => {
    styles[index] = { 
      cellWidth: width,
      minCellHeight: 10
    };
  });
  return styles;
}


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
        setShowSubMenu(false);
        setShowSearchMenu(false);
    }
  }; 

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // Close submenu when search menu opens and vice versa
  useEffect(() => {
    if (showSearchMenu) {
      setShowSubMenu(false);
    }
  }, [showSearchMenu]);

  const handleMouseEnterDropdown = () => {
    clearTimeout(timeoutRef.current);
    setShowDropdown(true);
  };

  const handleMouseLeaveDropdown = () => {
    timeoutRef.current = setTimeout(() => {
      if (!showSubMenu && !showSearchMenu) {
        setShowDropdown(false);
      }
    }, 200);
  };

  const handleMouseEnterSubMenu = () => {
    clearTimeout(timeoutRef.current);
    setShowSubMenu(true);
  };

  const handleMouseLeaveSubMenu = () => {
    timeoutRef.current = setTimeout(() => {
      setShowSubMenu(false);

      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowDropdown(false);
      }
    }, 200);
  };


  const handleSearchClick = (e) => {
    e.stopPropagation();
    setShowSearchMenu(true);
    setShowSubMenu(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (MenuSearchQuery.trim()) {
      onSearch(MenuSearchQuery);
      setShowSearchMenu(false);
      setShowDropdown(false);
    }
  };

  const handleFilterItemClick = (filterType) => {
    onFilterChange(filterType);
    setShowSubMenu(false);
    setShowDropdown(false);
  };

  return (
   <div
      className="flex justify-between items-center text-white font-[Aldrich] bg-black"
      style={{
        marginBottom: "-15px",
        marginTop: "5px",
        padding: "0 290px",
        width: "84%",
      }}
    >
      {/* Results Section */}
      <div className="relative inline-block">
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
            {totalResultsCount > 0 ? totalResultsCount : "N/A"}
          </span>
        </button>
      </div>

      {/* Filter and Export Section */}
      <div className="flex space-x-4" style={{ gap: "10px" }}>
        <div
          className="relative inline-flex items-center"
          onMouseEnter={handleMouseEnterDropdown}
          onMouseLeave={handleMouseLeaveDropdown}
          ref={dropdownRef}
        >
          <SvgSpinnersBlocksShuffle3
            style={{
              width: "17px",
              height: "17px",
              color: "#00D1FF",
              marginRight: "20px",
            }}
            onClick={shuffleBoxes}
          />
          <button
            className="relative bg-transparent text-white border-none cursor-pointer flex items-center font-[Aldrich]"
            style={{
              padding: "8px 0px",
              fontSize: "14px",
              marginLeft: "10px",
            }}
            onClick={() => setShowDropdown(!showDropdown)}
          >
            Filter <span className="text-[#a0ddff]">(1/2)</span>
            <i style={{ marginLeft: "8px", color: "white" }}>
              <FontAwesomeIcon icon={faCaretDown} />
            </i>
          </button>

          {showDropdown && (
            <div
              className="bg-[#00060C] absolute text-xs transform text-[#A0DDFF] -translate-x-1/2 z-10 mt-40 rounded-sm shadow-[1px_1px_5px_0_#0094ffa8] border border-[#00D1FF] font-[Aldrich]"
              style={{
                textAlign: "center",
                transition: "opacity 0.2s ease-in-out",
                width: "130px",
                left: "90px",
              }}
              onMouseEnter={handleMouseEnterDropdown}
              onMouseLeave={handleMouseLeaveDropdown}
            >
              <div
                className="p-2 py-3 text-sm cursor-pointer hover:text-white border-b border-[#00D1FF]"
                onMouseEnter={handleMouseEnterSubMenu}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubMenu(!showSubMenu);
                  setShowSearchMenu(false);
                }}
              >
                Source
              </div>
              
              <div
                className="p-2 py-3 text-sm cursor-pointer hover:text-white rounded-md"
                onClick={handleSearchClick}
              >
                <FontAwesomeIcon icon={faSearch} style={{ marginRight: "8px" }} />
                Search
              </div>
            </div>
          )}

          {/* Source Submenu */}
          {showSubMenu && (
            <div
              ref={subMenuRef}
              className="absolute px-4 left-full top-0 z-20 mt-0 text-xs panel rounded-sm shadow-[1px_1px_5px_0_#0094ffa8] bg-black border border-[#00D1FF] "
              style={{
                textAlign: "center",
                width: "130px",
                marginLeft: "10px",
                left: "130px",
                top: "40px"
              }}
              onMouseEnter={handleMouseEnterSubMenu}
              onMouseLeave={handleMouseLeaveSubMenu}
            >
              <div
                className="p-2 text-white cursor-pointer hover:text-[#A0DDFF] py-3 border-b border-[#00D1FF]"
                onClick={() => handleFilterItemClick("all")}
              >
                All
              </div>
              <div
                className="p-2 text-white cursor-pointer hover:text-[#A0DDFF] py-3 border-b border-[#00D1FF]"
                onClick={() => handleFilterItemClick("darkweb")}
              >
                Darkweb
              </div>
              <div
                className="p-2 text-white cursor-pointer hover:text-[#A0DDFF] py-3 border-b border-[#00D1FF]"
                onClick={() => handleFilterItemClick("telegram")}
              >
                Telegram
              </div>
              <div
                className="p-2 text-white cursor-pointer hover:text-[#A0DDFF] py-3 border-b border-[#00D1FF]"
                onClick={() => handleFilterItemClick("ransomware")}
              >
                Ransomware
              </div>
              <div
                className="p-2 text-white cursor-pointer hover:text-[#A0DDFF] py-3 rounded-md"
                onClick={() => handleFilterItemClick("darkwebcredentials")}
              >
                Darkweb Credentials
              </div>
            </div>
          )}

          {/* Search Menu */}
          {showSearchMenu && (
            <div
              ref={searchMenuRef}
              className="absolute left-full top-0 z-20 mt-0 rounded-md shadow-lg text-xs font-sans panel border border-[#00D1FF] "
              style={{
                textAlign: "center",
                width: "200px",
                marginLeft: "10px",
                padding: "10px",
                left: "130px",
                top: "80px"
              }}
            >
              <form onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  value={MenuSearchQuery}
                  onChange={(e) => MenuSetSearchQuery(e.target.value)}
                  placeholder="Enter search query..."
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "none",
                    marginBottom: "10px",
                    color: "black"
                  }}
                  autoFocus
                />
                <button
                className="bg-[#084857] "
                  type="submit"
                  style={{
                    color: "white",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Search
                </button>
              </form>
            </div>
          )}
        </div>
        
        <div className="relative inline-block">
          <button
            className="relative bg-transparent text-white border-none cursor-pointer flex items-center font-[Aldrich]"
            style={{
              padding: "8px 0px",
              fontSize: "14px",
            }}
            onClick={handleExportClick}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export'}
            <i style={{ marginLeft: "8px", color: "white" }}>
              <FontAwesomeIcon icon={isExporting ? faSpinner : faDownload} spin={isExporting} />
            </i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Results;