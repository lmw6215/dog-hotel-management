
import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// --- Interfaces ---
interface Dog {
  id: string;
  name: string;
  entryTime: string; // ISO String
  brushing: number;
  walking: number;
}

interface Record extends Dog {
  exitTime: string; // ISO String
  totalTime: string;
  fee: number;
  baseFee: number;
  daycareFee: number;
}

// --- Google Sheets Configuration ---
const API_KEY = process.env.API_KEY!; // IMPORTANT: Ensure this is set in your environment
const CURRENT_DOGS_SHEET_ID = '1gUKWjYjN0QadbbSiArGojHRFFykp_7MgPOXXxnhPzUs';
const RECORDS_SHEET_ID = '1f6V9d7Ns1IJJZGsDPzdWMgQmkkEoZwNCL2lbr1wBNu0';

const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets"; // Read/write access

// Sheet structure
const DOGS_SHEET_NAME = 'Sheet1';
const RECORDS_SHEET_NAME = 'Sheet1';

const DOGS_HEADER = ['ID', 'Name', 'EntryTime', 'Brushing', 'Walking'];
const RECORDS_HEADER = ['ID', 'Name', 'EntryTime', 'Brushing', 'Walking', 'ExitTime', 'TotalTime', 'Fee', 'BaseFee', 'DaycareFee'];

const App = () => {
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [records, setRecords] = useState<Record[]>([]);
  const [dogName, setDogName] = useState('');
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutDetails, setCheckoutDetails] = useState<any>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDog, setEditingDog] = useState<Dog | null>(null);
  const [newEntryDate, setNewEntryDate] = useState('');
  const [newEntryTime, setNewEntryTime] = useState('');

  const [showRecordsModal, setShowRecordsModal] = useState(false);

  const [isGapiReady, setIsGapiReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showLoadingIndicator = (show: boolean) => {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = show ? 'flex' : 'none';
    }
    setIsLoading(show);
  };

  // --- Google API Initialization ---
  useEffect(() => {
    const initGapiClient = async () => {
      try {
        await new Promise<void>((resolve) => gapi.load('client', resolve));
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
        });
        setIsGapiReady(true);
      } catch (e: any) {
        console.error("Error initializing GAPI client", e);
        setError(`Google API 초기화 실패: ${e.message || '알 수 없는 오류'}`);
      }
    };

    if (typeof gapi !== 'undefined') {
      initGapiClient();
    } else {
      // Poll for gapi, as script loading is async
      const intervalId = setInterval(() => {
        if (typeof gapi !== 'undefined') {
          clearInterval(intervalId);
          initGapiClient();
        }
      }, 100);
      return () => clearInterval(intervalId);
    }
  }, []);

  // --- Data Fetching from Google Sheets ---
  const fetchDogs = useCallback(async () => {
    if (!isGapiReady) return;
    showLoadingIndicator(true);
    setError(null);
    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: CURRENT_DOGS_SHEET_ID,
        range: `${DOGS_SHEET_NAME}!A2:E`, // Assuming A1:E1 is header
      });
      const rows = response.result.values || [];
      const fetchedDogs: Dog[] = rows.map((row: any[]) => ({
        id: row[0],
        name: row[1],
        entryTime: row[2],
        brushing: parseInt(row[3], 10) || 0,
        walking: parseInt(row[4], 10) || 0,
      })).filter(dog => dog.id && dog.name); // Ensure basic data integrity
      setDogs(fetchedDogs);
    } catch (e: any) {
      console.error("Error fetching dogs", e);
      setError(`강아지 목록 로딩 실패: ${e.result?.error?.message || e.message || '알 수 없는 오류'}`);
      setDogs([]); // Clear dogs on error to avoid stale data issues
    } finally {
      showLoadingIndicator(false);
    }
  }, [isGapiReady]);

  const fetchRecords = useCallback(async () => {
    if (!isGapiReady) return;
    showLoadingIndicator(true);
    setError(null);
    try {
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: RECORDS_SHEET_ID,
        range: `${RECORDS_SHEET_NAME}!A2:J`, // Assuming A1:J1 is header
      });
      const rows = response.result.values || [];
      const fetchedRecords: Record[] = rows.map((row: any[]) => ({
        id: row[0],
        name: row[1],
        entryTime: row[2],
        brushing: parseInt(row[3], 10) || 0,
        walking: parseInt(row[4], 10) || 0,
        exitTime: row[5],
        totalTime: row[6],
        fee: parseFloat(row[7]) || 0,
        baseFee: parseFloat(row[8]) || 0,
        daycareFee: parseFloat(row[9]) || 0,
      })).filter(rec => rec.id && rec.name);
      setRecords(fetchedRecords);
    } catch (e: any) {
      console.error("Error fetching records", e);
      setError(`이용 기록 로딩 실패: ${e.result?.error?.message || e.message || '알 수 없는 오류'}`);
      setRecords([]);
    } finally {
      showLoadingIndicator(false);
    }
  }, [isGapiReady]);

  useEffect(() => {
    if (isGapiReady) {
      fetchDogs();
      fetchRecords();
    }
  }, [isGapiReady, fetchDogs, fetchRecords]);


  // --- Data Writing to Google Sheets ---
  const GSheets_WriteDogs = async (updatedDogs: Dog[]) => {
    if (!isGapiReady) {
      setError("Google API가 준비되지 않았습니다.");
      return false;
    }
    showLoadingIndicator(true);
    setError(null);
    try {
      const values = [
        DOGS_HEADER,
        ...updatedDogs.map(dog => [dog.id, dog.name, dog.entryTime, dog.brushing, dog.walking])
      ];
      // Clear existing data first (excluding header) then update
      // To be safe, clear a large range, or get actual data last row and clear that.
      // For simplicity, we clear a fixed large range.
      // Or, more simply, just overwrite starting from A1.
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CURRENT_DOGS_SHEET_ID,
        range: `${DOGS_SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });
      return true;
    } catch (e: any) {
      console.error("Error writing dogs to sheet", e);
      setError(`강아지 정보 저장 실패: ${e.result?.error?.message || e.message || '알 수 없는 오류'}`);
      fetchDogs(); // Re-fetch to revert to last known good state
      return false;
    } finally {
      showLoadingIndicator(false);
    }
  };
  
  const GSheets_AppendRecord = async (newRecord: Record) => {
    if (!isGapiReady) {
      setError("Google API가 준비되지 않았습니다.");
      return false;
    }
    showLoadingIndicator(true);
    setError(null);
    try {
      const values = [
        [newRecord.id, newRecord.name, newRecord.entryTime, newRecord.brushing, newRecord.walking, newRecord.exitTime, newRecord.totalTime, newRecord.fee, newRecord.baseFee, newRecord.daycareFee]
      ];
      
      // Check if records sheet is empty or only has header
      const currentRecordsData = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: RECORDS_SHEET_ID,
          range: `${RECORDS_SHEET_NAME}!A1:A`, 
      });
      const currentRows = currentRecordsData.result.values;
      let needsHeader = !currentRows || currentRows.length === 0;
      if (currentRows && currentRows.length === 1 && JSON.stringify(currentRows[0]) === JSON.stringify(RECORDS_HEADER) ) {
         // Only header exists, so we are appending the first data row.
      } else if (currentRows && currentRows.length > 0 && JSON.stringify(currentRows[0]) !== JSON.stringify(RECORDS_HEADER)) {
        // Data exists but no header, or wrong header. For simplicity, assume we append. If header is critical, it should be written when sheet is first created.
        // For robustness, one might write the header if it's missing. Here we just append the data.
      }


      if (needsHeader) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: RECORDS_SHEET_ID,
          range: `${RECORDS_SHEET_NAME}!A1`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [RECORDS_HEADER, ...values] }
        });
      } else {
         await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: RECORDS_SHEET_ID,
          range: `${RECORDS_SHEET_NAME}!A1`, // Appends after the last row with data in this range
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values }
        });
      }
      return true;
    } catch (e: any) {
      console.error("Error appending record to sheet", e);
      setError(`이용 기록 저장 실패: ${e.result?.error?.message || e.message || '알 수 없는 오류'}`);
      fetchRecords(); // Re-fetch
      return false;
    } finally {
      showLoadingIndicator(false);
    }
  };

  const generateId = () => crypto.randomUUID();

  const handleCheckIn = async () => {
    if (!dogName.trim()) {
      alert('강아지 이름을 입력하세요.');
      return;
    }
    const newDog: Dog = {
      id: generateId(),
      name: dogName.trim(),
      entryTime: new Date().toISOString(),
      brushing: 0,
      walking: 0,
    };
    const updatedDogs = [...dogs, newDog];
    const success = await GSheets_WriteDogs(updatedDogs);
    if (success) {
      setDogs(updatedDogs);
      setDogName('');
    }
  };

  const updateDogService = async (dogId: string, service: 'brushing' | 'walking', operation: 'add' | 'remove') => {
    let tempDogs = [...dogs];
    let alertMsg = '';
    const dogIndex = tempDogs.findIndex(dog => dog.id === dogId);

    if (dogIndex === -1) return;

    let count = tempDogs[dogIndex][service];
    if (operation === 'add') {
      count++;
    } else if (operation === 'remove' && count > 0) {
      count--;
    } else if (operation === 'remove' && count === 0) {
      alertMsg = `${service === 'brushing' ? '양치' : '산책'} 횟수가 0회입니다.`;
    }
    
    if (alertMsg) {
      alert(alertMsg);
      return;
    }

    tempDogs[dogIndex] = { ...tempDogs[dogIndex], [service]: count };
    
    const success = await GSheets_WriteDogs(tempDogs);
    if (success) {
      setDogs(tempDogs);
    }
  };
  
  const formatDateTime = (isoString: string) => {
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return "유효하지 않은 날짜";
        return date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch (e) {
        return "날짜 오류";
    }
  };
  
  const formatDateForInput = (isoString: string) => {
    try {
        const date = new Date(isoString);
         if (isNaN(date.getTime())) return "";
        return date.toISOString().substring(0, 10); // YYYY-MM-DD
    } catch (e) {
        return "";
    }
  };

  const formatTimeForInput = (isoString: string) => {
     try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return "00:00";
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`; // HH:MM
    } catch (e) {
        return "00:00";
    }
  };

  const calculateDuration = (entryTimeStr: string, exitTimeStr: string) => {
    const entryTime = new Date(entryTimeStr);
    const exitTime = new Date(exitTimeStr);
    let durationMs = exitTime.getTime() - entryTime.getTime();

    if (durationMs < 0) durationMs = 0;

    const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
    durationMs -= days * (1000 * 60 * 60 * 24);
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    durationMs -= hours * (1000 * 60 * 60);
    const minutes = Math.floor(durationMs / (1000 * 60));
    return `${days}일 ${hours}시간 ${minutes}분`;
  };
  
  const calculateFees = useCallback((dog: Dog, exitTimeStr: string) => {
    const entryTime = new Date(dog.entryTime);
    const exitTime = new Date(exitTimeStr);

    const entryDateOnly = new Date(entryTime.getFullYear(), entryTime.getMonth(), entryTime.getDate());
    const exitDateOnly = new Date(exitTime.getFullYear(), exitTime.getMonth(), exitTime.getDate());
    
    const totalDays = Math.max(0, Math.floor((exitDateOnly.getTime() - entryDateOnly.getTime()) / (1000 * 60 * 60 * 24)));

    const pureOvernightStayFee = totalDays * 35000;

    let daycareFee = 0;
    const effectiveEntryTimeForDaycareCalc = new Date(entryTime);
    effectiveEntryTimeForDaycareCalc.setDate(entryTime.getDate() + totalDays);

    if (exitTime > effectiveEntryTimeForDaycareCalc) {
        let totalMinutes = (exitTime.getTime() - effectiveEntryTimeForDaycareCalc.getTime()) / (1000 * 60);
        if (totalMinutes > 20) { 
            totalMinutes -= 20;
            const totalHours = Math.ceil(totalMinutes / 60);
            daycareFee = Math.min(30000, totalHours * 4000);
        }
    }
    
    const brushingFeeTotal = dog.brushing * 2000;
    const walkingFeeTotal = dog.walking * 10000;

    const baseFeeForDisplay = pureOvernightStayFee + brushingFeeTotal + walkingFeeTotal;
    const additionalFeeForDisplay = daycareFee; 
    const totalFeeToCharge = baseFeeForDisplay + additionalFeeForDisplay;

    return {
        totalFee: totalFeeToCharge,
        baseFee: baseFeeForDisplay,
        daycareFee: additionalFeeForDisplay,
        brushingFee: brushingFeeTotal,
        walkingFee: walkingFeeTotal,
        totalTime: calculateDuration(dog.entryTime, exitTimeStr),
    };
  }, []);

  const handleOpenCheckout = (dogId: string) => {
    const dogToCheckout = dogs.find(d => d.id === dogId);
    if (dogToCheckout) {
      const now = new Date().toISOString();
      const feeDetails = calculateFees(dogToCheckout, now);
      setCheckoutDetails({ ...dogToCheckout, ...feeDetails, exitTime: now });
      setShowCheckoutModal(true);
    }
  };

  const handleConfirmCheckout = async () => {
    if (checkoutDetails) {
      const newRecord: Record = {
        id: checkoutDetails.id,
        name: checkoutDetails.name,
        entryTime: checkoutDetails.entryTime,
        brushing: checkoutDetails.brushing,
        walking: checkoutDetails.walking,
        exitTime: checkoutDetails.exitTime,
        totalTime: checkoutDetails.totalTime,
        fee: checkoutDetails.totalFee,
        baseFee: checkoutDetails.baseFee,
        daycareFee: checkoutDetails.daycareFee,
      };
      
      const recordAppended = await GSheets_AppendRecord(newRecord);
      if (!recordAppended) return; // Stop if record append failed
      
      const updatedDogs = dogs.filter(dog => dog.id !== checkoutDetails.id);
      const dogsWritten = await GSheets_WriteDogs(updatedDogs);

      if (dogsWritten) {
        setRecords([...records, newRecord]);
        setDogs(updatedDogs);
        setShowCheckoutModal(false);
        setCheckoutDetails(null);
        setSelectedDogId(null);
      }
    }
  };

  const handleOpenEditModal = (dogId: string) => {
    const dogToEdit = dogs.find(d => d.id === dogId);
    if (dogToEdit) {
      setEditingDog(dogToEdit);
      setNewEntryDate(formatDateForInput(dogToEdit.entryTime));
      setNewEntryTime(formatTimeForInput(dogToEdit.entryTime));
      setShowEditModal(true);
    }
  };

  const handleSaveEntryTime = async () => {
    if (editingDog && newEntryDate && newEntryTime) {
      try {
        const [year, month, day] = newEntryDate.split('-').map(Number);
        const [hours, minutes] = newEntryTime.split(':').map(Number);
        
        if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            alert('유효하지 않은 날짜 또는 시간입니다. 다시 확인해주세요.');
            return;
        }
        const newEntryDateTime = new Date(year, month - 1, day, hours, minutes);

        if (isNaN(newEntryDateTime.getTime())) {
          alert('유효하지 않은 날짜 또는 시간 형식입니다.');
          return;
        }
        
        const updatedDogs = dogs.map(dog => 
          dog.id === editingDog.id ? { ...dog, entryTime: newEntryDateTime.toISOString() } : dog
        );

        const success = await GSheets_WriteDogs(updatedDogs);
        if (success) {
          setDogs(updatedDogs);
          setShowEditModal(false);
          setEditingDog(null);
        }
      } catch (error) {
        alert('날짜/시간 설정 중 오류가 발생했습니다. 형식을 확인해주세요 (YYYY-MM-DD, HH:MM).');
        console.error("Error parsing date/time:", error);
      }
    }
  };
  
  const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '25px', maxWidth: '850px', margin: '20px auto', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 6px 18px rgba(0,0,0,0.1)' },
    header: { fontSize: '28px', fontWeight: 'bold', marginBottom: '30px', color: '#1a2732', textAlign: 'center' },
    inputGroup: { display: 'flex', marginBottom: '25px', gap: '12px' },
    input: { flexGrow: 1, padding: '12px 15px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '16px', height: '42px', boxSizing: 'border-box' },
    button: { 
        padding: '0 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px', fontWeight: '500', height: '42px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.2s ease, box-shadow 0.2s ease', boxSizing: 'border-box'
    },
    checkInButton: { backgroundColor: '#28a745', color: 'white' },
    actionButton: { backgroundColor: '#007bff', color: 'white' },
    dangerButton: { backgroundColor: '#dc3545', color: 'white' },
    secondaryButton: { backgroundColor: '#6c757d', color: 'white'},
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '25px', border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'hidden' },
    th: { borderBottom: '2px solid #dee2e6', padding: '12px 15px', textAlign: 'left', backgroundColor: '#f8f9fa', color: '#495057', fontWeight: 'bold', fontSize: '15px' },
    td: { borderBottom: '1px solid #e9ecef', padding: '12px 15px', textAlign: 'left', verticalAlign: 'middle', fontSize: '15px' },
    rowEven: { backgroundColor: '#fdfdfe'},
    rowOdd: { backgroundColor: '#f8f9fa'},
    selectedRow: { backgroundColor: '#cfe2ff', fontWeight: '500' },
    modal: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: '#fff', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '550px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 5px 20px rgba(0,0,0,0.2)' },
    modalTitle: { fontSize: '22px', fontWeight: 'bold', marginBottom: '20px', color: '#343a40'},
    modalActions: { marginTop: '25px', display: 'flex', justifyContent: 'flex-end', gap: '12px' },
    modalText: { marginBottom: '12px', lineHeight: '1.6', color: '#495057', fontSize: '16px' },
    modalStrong: { fontWeight: '600', color: '#212529'},
    serviceButton: { fontSize: '13px', padding: '4px 8px', minWidth: '30px', height: 'auto', marginRight: '4px' },
    recordsButton: { backgroundColor: '#6f42c1', color: 'white', marginTop: '10px' },
    actionButtonsContainer: { display: 'flex', justifyContent: 'center', gap: '15px', padding: '20px 0', marginTop: '20px', borderTop: '1px solid #e9ecef' },
    serviceButtonsCell: { display: 'flex', alignItems: 'center', gap: '5px'},
    formLabel: {display: 'block', marginBottom: '6px', fontWeight: '500', color: '#495057'},
    formInput: {width: 'calc(100% - 32px)', padding: '10px 15px', border: '1px solid #ced4da', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' as 'border-box' },
    errorText: { color: 'red', textAlign: 'center', margin: '10px 0', fontSize: '15px', fontWeight: '500'}
  };
  
  const selectedDog = dogs.find(dog => dog.id === selectedDogId);

  if (!isGapiReady && !API_KEY) {
     return <div style={styles.container}><p style={styles.errorText}>Google API 키가 설정되지 않았습니다. 환경 변수 API_KEY를 확인해주세요.</p></div>;
  }
  if (!isGapiReady && API_KEY) {
     return <div style={styles.container}><p>Google API 클라이언트 초기화 중...</p></div>;
  }


  return (
    <div style={styles.container}>
      <h1 style={styles.header}>강아지 호텔 관리 시스템</h1>
      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.inputGroup}>
        <input
          type="text"
          value={dogName}
          onChange={(e) => setDogName(e.target.value)}
          placeholder="강아지 이름"
          style={styles.input}
          aria-label="강아지 이름 입력"
          onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleCheckIn()}
          disabled={isLoading}
        />
        <button onClick={handleCheckIn} style={{...styles.button, ...styles.checkInButton}} disabled={isLoading}>입실</button>
      </div>
      
      <div style={{display: 'flex', justifyContent: 'center', marginBottom: '25px'}}>
        <button 
            onClick={() => { setError(null); setShowRecordsModal(true); }}
            style={{...styles.button, ...styles.recordsButton}}
            aria-label="이용 기록 보기"
            disabled={isLoading}
        >
          이용 기록 보기
        </button>
      </div>

      <h2 style={{ fontSize: '22px', marginTop: '30px', marginBottom: '15px', color: '#34495e', borderBottom: '1px solid #e0e0e0', paddingBottom: '10px' }}>현재 입실 중인 강아지</h2>
      {dogs.length === 0 && !isLoading ? <p style={{textAlign: 'center', color: '#6c757d', fontSize: '16px'}}>현재 입실 중인 강아지가 없습니다.</p> : (
        <table style={styles.table} aria-label="현재 입실 중인 강아지 목록">
          <thead>
            <tr>
              <th style={styles.th}>선택</th>
              <th style={styles.th}>이름</th>
              <th style={styles.th}>입실 시간</th>
              <th style={{...styles.th, textAlign: 'center'}}>양치</th>
              <th style={{...styles.th, textAlign: 'center'}}>산책</th>
              <th style={{...styles.th, textAlign: 'center'}}>서비스 관리</th>
            </tr>
          </thead>
          <tbody>
            {dogs.map((dog, index) => (
              <tr key={dog.id} style={{...(dog.id === selectedDogId ? styles.selectedRow : (index % 2 === 0 ? styles.rowEven : styles.rowOdd) ), cursor: 'pointer'}} onClick={() => !isLoading && setSelectedDogId(dog.id)}>
                <td style={styles.td}>
                  <input 
                    type="radio" 
                    name="selectedDog" 
                    checked={dog.id === selectedDogId} 
                    onChange={() => !isLoading && setSelectedDogId(dog.id)}
                    aria-label={`${dog.name} 선택`}
                    style={{cursor: 'pointer'}}
                    disabled={isLoading}
                  />
                </td>
                <td style={styles.td}>{dog.name}</td>
                <td style={styles.td}>{formatDateTime(dog.entryTime)}</td>
                <td style={{...styles.td, textAlign: 'center'}}>{dog.brushing}회</td>
                <td style={{...styles.td, textAlign: 'center'}}>{dog.walking}회</td>
                <td style={{...styles.td, ...styles.serviceButtonsCell, justifyContent: 'center'}}>
                  <button onClick={(e) => {e.stopPropagation(); !isLoading && updateDogService(dog.id, 'brushing', 'add')}} style={{...styles.button, ...styles.actionButton, ...styles.serviceButton}} title="양치 추가" disabled={isLoading}>+</button>
                  <button onClick={(e) => {e.stopPropagation(); !isLoading && updateDogService(dog.id, 'brushing', 'remove')}} style={{...styles.button, ...styles.dangerButton, ...styles.serviceButton}} title="양치 삭제" disabled={isLoading}>-</button>
                  <span style={{margin: '0 8px', color: '#adb5bd'}}>|</span>
                  <button onClick={(e) => {e.stopPropagation(); !isLoading && updateDogService(dog.id, 'walking', 'add')}} style={{...styles.button, ...styles.actionButton, ...styles.serviceButton}} title="산책 추가" disabled={isLoading}>+</button>
                  <button onClick={(e) => {e.stopPropagation(); !isLoading && updateDogService(dog.id, 'walking', 'remove')}} style={{...styles.button, ...styles.dangerButton, ...styles.serviceButton}} title="산책 삭제" disabled={isLoading}>-</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedDogId && selectedDog && (
        <div style={styles.actionButtonsContainer}>
          <button onClick={() => !isLoading && handleOpenCheckout(selectedDogId)} style={{...styles.button, ...styles.dangerButton}} disabled={isLoading}>퇴실</button>
          <button onClick={() => !isLoading && handleOpenEditModal(selectedDogId)} style={{...styles.button, ...styles.actionButton}} disabled={isLoading}>입실 시간 수정</button>
        </div>
      )}

      {showCheckoutModal && checkoutDetails && (
        <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle} id="checkout-title">퇴실 확인</h3>
            <p style={styles.modalText}><strong style={styles.modalStrong}>강아지 이름:</strong> {checkoutDetails.name}</p>
            <p style={styles.modalText}><strong style={styles.modalStrong}>총 이용시간:</strong> {checkoutDetails.totalTime}</p>
            <p style={styles.modalText}><strong style={styles.modalStrong}>양치 횟수:</strong> {checkoutDetails.brushing}회 (비용: {checkoutDetails.brushingFee.toLocaleString()}원)</p>
            <p style={styles.modalText}><strong style={styles.modalStrong}>산책 횟수:</strong> {checkoutDetails.walking}회 (비용: {checkoutDetails.walkingFee.toLocaleString()}원)</p>
            <hr style={{margin: '20px 0', borderColor: '#e9ecef'}} />
            <p style={styles.modalText}><strong style={styles.modalStrong}>기본 요금 (숙박비 + 서비스):</strong> {checkoutDetails.baseFee.toLocaleString()}원</p>
            <p style={styles.modalText}><strong style={styles.modalStrong}>추가 요금 (데이케어):</strong> {checkoutDetails.daycareFee.toLocaleString()}원</p>
            <p style={{...styles.modalText, fontWeight: 'bold', fontSize: '18px', marginTop: '15px', color: '#1a2732'}}><strong style={styles.modalStrong}>총 이용 요금: {checkoutDetails.totalFee.toLocaleString()}원</strong></p>
            <div style={styles.modalActions}>
              <button onClick={() => setShowCheckoutModal(false)} style={{...styles.button, ...styles.secondaryButton}} disabled={isLoading}>취소</button>
              <button onClick={handleConfirmCheckout} style={{...styles.button, ...styles.dangerButton}} disabled={isLoading}>퇴실 확정</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingDog && (
        <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle} id="edit-title">입실 시간 수정: {editingDog.name}</h3>
            <div style={{marginBottom: '15px'}}>
              <label htmlFor="entryDate" style={styles.formLabel}>날짜:</label>
              <input 
                type="date" 
                id="entryDate"
                value={newEntryDate} 
                onChange={e => setNewEntryDate(e.target.value)} 
                style={{...styles.input, width: '100%'}}
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="entryTime" style={styles.formLabel}>시간 (24시 형식):</label>
              <input 
                type="time" 
                id="entryTime"
                value={newEntryTime} 
                onChange={e => setNewEntryTime(e.target.value)} 
                style={{...styles.input, width: '100%'}}
                disabled={isLoading}
              />
            </div>
            <div style={styles.modalActions}>
              <button onClick={() => setShowEditModal(false)} style={{...styles.button, ...styles.secondaryButton}} disabled={isLoading}>취소</button>
              <button onClick={handleSaveEntryTime} style={{...styles.button, ...styles.actionButton}} disabled={isLoading}>저장</button>
            </div>
          </div>
        </div>
      )}

      {showRecordsModal && (
        <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="records-title">
          <div style={{...styles.modalContent, maxWidth: '750px'}}>
            <h3 style={styles.modalTitle} id="records-title">이용 기록</h3>
            {records.length === 0 && !isLoading? <p style={{textAlign: 'center', color: '#6c757d', fontSize: '16px'}}>이용 기록이 없습니다.</p> : (
              <div style={{maxHeight: '60vh', overflowY: 'auto'}}>
                <table style={{...styles.table, fontSize: '14px', marginTop: 0}}>
                  <thead>
                    <tr>
                      <th style={styles.th}>이름</th>
                      <th style={styles.th}>입실</th>
                      <th style={styles.th}>퇴실</th>
                      <th style={styles.th}>총 시간</th>
                      <th style={{...styles.th, textAlign: 'center'}}>양치</th>
                      <th style={{...styles.th, textAlign: 'center'}}>산책</th>
                      <th style={{...styles.th, textAlign: 'right'}}>총 요금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Sort records by exit time descending */}
                    {records.slice().sort((a,b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime()).map((rec, index) => (
                      <tr key={rec.id} style={index % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                        <td style={styles.td}>{rec.name}</td>
                        <td style={styles.td}>{formatDateTime(rec.entryTime)}</td>
                        <td style={styles.td}>{formatDateTime(rec.exitTime)}</td>
                        <td style={styles.td}>{rec.totalTime}</td>
                        <td style={{...styles.td, textAlign: 'center'}}>{rec.brushing}회</td>
                        <td style={{...styles.td, textAlign: 'center'}}>{rec.walking}회</td>
                        <td style={{...styles.td, textAlign: 'right'}}>{rec.fee.toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={styles.modalActions}>
              <button onClick={() => setShowRecordsModal(false)} style={{...styles.button, ...styles.secondaryButton}} disabled={isLoading}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}

if (typeof crypto === 'undefined' || typeof crypto.randomUUID === 'undefined') {
  // @ts-ignore Polyfill for environments where crypto.randomUUID is not available
  globalThis.crypto = globalThis.crypto || {};
  globalThis.crypto.randomUUID = function(): `${string}-${string}-${string}-${string}-${string}` {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

// Expose gapi to window for easier debugging if needed, and ensure it's available.
declare global {
  interface Window {
    gapi: any;
  }
}
const gapi = window.gapi;
