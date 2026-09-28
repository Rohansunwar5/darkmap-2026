import apiClient from "../../../lib/apiClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faCross, faXmark } from "@fortawesome/free-solid-svg-icons";
import Spinner from "./common/spinner";
import { useAuth } from "../../../context/AuthContext";
import React, { useState, useRef, useEffect } from "react";


const DayChip = ({ day, selected, onClick }) => {
  return (
    <button className={`rounded-xl cursor-pointer hover:border-primary-500 border-2 border-primary-900 px-2 text-sm py-1 ${selected ? "bg-primary-700 text-white" : ""}`} onClick={onClick}>
      {day}
    </button>
  );
};

const daysOfWeek = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

export default function AlertCreator({ channelName, channelId, stats, prefill }) {
  const [selectedDays, setSelectedDays] = useState([]);
  const [alertTime, setAlertTime] = useState("10:00");
  const [alertKeywords, setAlertKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const { user } = useAuth();

  // Prefill effect
  useEffect(() => {
    if (prefill) {
      if (prefill.alertDays && Array.isArray(prefill.alertDays)) {
        setSelectedDays(prefill.alertDays.map(day => day.charAt(0).toUpperCase() + day.slice(1))); // Capitalize for chips
      }
      if (prefill.alertTime) setAlertTime(prefill.alertTime);
      if (prefill.triggerWords && Array.isArray(prefill.triggerWords)) {
        setAlertKeywords(prefill.triggerWords);
      }
    }
  }, [prefill]);

  const toggleDay = (day) => {
    if (loading) return;
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreateAlert = async () => {
    if (selectedDays.length === 0) {
      setMessage("⚠️ Please select at least one day.");
      return;
    }
    if (!alertTime) {
      setMessage("⚠️ Please choose a time.");
      return;
    }
    if (alertKeywords.length > 10) {
      setMessage("⚠️ Please choose less than 10 keywords.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const body = {
        channelName: channelName,
        // Use the real channel id from the analysis so the bookmark maps to the
        // actual channel (and the duplicate check works). Fall back to a random
        // id only when we have no analysis context (legacy call sites).
        channelId: channelId ?? Math.floor(Math.random() * (99999999 - 10000000 + 1)) + 10000000,
        alertTime,
        alertDays: selectedDays.map((d) => d.toLowerCase()),
        triggerWords: alertKeywords,
      };

      // Seed the bookmark with the stats the user just saw on the analysis page,
      // so it shows the same rich data immediately instead of zeros.
      if (stats) {
        body.stats = {
          totalMessages: stats.totalMessages,
          uniqueUsersTotal: stats.uniqueUsersTotal,
          totalLinks: stats.totalLinks,
          frequencyHourly: stats.frequencyHourly,
          frequencyUser: stats.frequencyUser,
          frequencyWeekday: stats.frequencyWeekday,
          firstMessageEver: stats.firstMessageEver,
          lastMessageEver: stats.lastMessageEver,
        };
      }

      await apiClient.post(`${import.meta.env.VITE_API_BASE_URL}/bookmark`, body);

      setMessage("✅ Alert created successfully!");
    } catch (err) {
      console.error(err);
      setMessage("❌ Failed to create alert!");
    } finally {
      setLoading(false);
    }
  };

  if (!channelName) {
    return <div className="p-10">Channel name not provided</div>;
  }

  return (
    <div className="rounded-xl shadow-sm max-w-xl">
      <h1 className="text-xl font-semibold">Alert Frequency</h1>
      <h4 className="text-sm text-gray-700">You will receive reports on your mail on these days</h4>

      <div className="flex flex-wrap gap-3 mt-4">
        {daysOfWeek.map((day) => (
          <DayChip
            key={day}
            day={day.charAt(0).toUpperCase() + day.slice(1)}
            selected={selectedDays.includes(day.charAt(0).toUpperCase() + day.slice(1))}
            onClick={() => toggleDay(day.charAt(0).toUpperCase() + day.slice(1))}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className="text-sm text-gray-700">Receive at</span>
        <input
          type="time"
          value={alertTime}
          onChange={(e) => setAlertTime(e.target.value)}
          className="rounded-xl border-2 border-primary-900 bg-primary-950 text-white accent-white hover:border-primary-500 px-2 py-1 text-sm cursor-pointer"
        />
      </div>

      <div>
        <h1 className="text-xl mt-4">Add Trigger keywords</h1>
        <h3 className="font-default-sans text-sm text-gray-500">
          You will be shown references to the given keywords
        </h3>
        <KeywordInput values={alertKeywords} onChange={(e) => setAlertKeywords(e)} />
        <span className="text-xs text-gray-500">
          Press enter in order to add the keyword. Choose at max 10 keywords
        </span>
      </div>

      <div className="flex mt-10 justify-between items-center">
        <div className="text-sm text-gray-500">Your email: {user?.email}</div>
        <button
          onClick={handleCreateAlert}
          disabled={loading}
          className="bg-primary-700 hover:bg-primary-500 transition-colors flex items-center px-4 rounded-full py-2 text-white disabled:opacity-50"
        >
          {loading ? (
            <>
              Creating <Spinner className="size-4 ms-3" />
            </>
          ) : (
            <>
              Create Group Alert
              <FontAwesomeIcon className="size-5 ms-4" icon={faCheckCircle} />
            </>
          )}
        </button>
      </div>

      {message && <p className="mt-4 text-sm">{message}</p>}
    </div>
  );
}

export function KeywordInput({ values = [], onChange = () => { }, placeholder = "Add keyword..." }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const addTag = (raw) => {
    const tag = raw.trim();
    if (!tag) return;
    onChange([...values, tag]);
    setInput("");
  };

  const removeAt = (index) => {
    const next = [...values.slice(0, index), ...values.slice(index + 1)];
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && input === "" && values.length) {
      removeAt(values.length - 1);
    }
  };

  return (
    <div className="w-full mt-2">
      <p className="min-h-[44px] border border-primary-500 rounded-xl p-2 flex items-center flex-wrap gap-2" onClick={() => inputRef.current && inputRef.current.focus()}>
        {values.map((v, i) => (
          <span key={v + i} className="inline-flex items-center gap-2 text-sm px-2 py-1 rounded-full bg-gray-900 text-white border">
            <span>{v}</span>
            <button
              type="button"
              className="ml-1 text-xs focus:outline-none hover:text-primary-500"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
            >
              <FontAwesomeIcon icon={faXmark}></FontAwesomeIcon>
            </button>
          </span>
        ))}

        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder={values.length ? "" : placeholder} className="flex-1 min-w-[120px] bg-transparent focus:outline-none text-sm" />
      </p>
    </div>
  );
}

// Example usage:
// const [keywords, setKeywords] = useState(["react", "ui"]);
// <KeywordInput values={keywords} onChange={setKeywords} />;
