import React, { useState } from 'react';
import { db } from '../../../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  Trash2,
  Send,
  RefreshCw,
  CreditCard,
  Building2
} from 'lucide-react';
import { generateExcelTemplate } from './excelUtils';
import { validatePayoutRow } from './payoutValidation';

const ExcelTab = ({ merchantId, onPayoutsCreated }) => {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileUpload = (uploadedFile) => {
    if (!uploadedFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Skip header row and empty rows
        const rows = jsonData.slice(1).filter(row => row.length > 0 && row[0]);

        const parsed = rows.map((row, index) => ({
          rowNumber: index + 2,
          userId: row[0]?.toString().trim() || '',
          merchantId: row[1]?.toString().trim() || merchantId,
          upiId: row[2]?.toString().trim() || '',
          accountNumber: row[3]?.toString().trim() || '',
          ifscCode: row[4]?.toString().trim().toUpperCase() || '',
          bankName: row[5]?.toString().trim() || '',
          accountHolderName: row[6]?.toString().trim() || '',
          amount: row[7] ? Number(row[7]) : 0
        }));

        setParsedData(parsed);

        // Validate all rows
        const validated = parsed.map(row => ({
          ...row,
          errors: validatePayoutRow(row),
          isValid: validatePayoutRow(row).length === 0
        }));

        setValidationResults(validated);
      } catch (error) {
        alert('Error parsing Excel file: ' + error.message);
      }
    };

    reader.readAsArrayBuffer(uploadedFile);
    setFile(uploadedFile);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const removeRow = (rowNumber) => {
    setValidationResults(validationResults.filter(r => r.rowNumber !== rowNumber));
  };

  const handleSubmit = async () => {
    const validRows = validationResults.filter(r => r.isValid);
    
    if (validRows.length === 0) {
      alert('No valid rows to submit');
      return;
    }

    if (!window.confirm(`Create ${validRows.length} payouts?`)) {
      return;
    }

    setUploading(true);

    try {
      const batchId = `batch_${Date.now()}`;
      
      for (const row of validRows) {
        const payoutData = {
          userId: row.userId,
          merchantId: row.merchantId,
          paymentMethod: row.upiId ? 'upi' : 'bank',
          accountHolderName: row.accountHolderName,
          amount: row.amount,
          createdBy: merchantId,
          creationMethod: 'excel',
          status: 'pending',
          requestTime: serverTimestamp(),
          batchId: batchId,
          rowNumber: row.rowNumber
        };

        if (row.upiId) {
          payoutData.upiId = row.upiId;
        } else {
          payoutData.accountNumber = row.accountNumber;
          payoutData.ifscCode = row.ifscCode;
          payoutData.bankName = row.bankName;
        }

        await addDoc(collection(db, 'payouts'), payoutData);
      }

      alert(`Successfully created ${validRows.length} payouts!`);
      setParsedData([]);
      setValidationResults([]);
      setFile(null);
      
      if (onPayoutsCreated) onPayoutsCreated();
    } catch (error) {
      alert('Error creating payouts: ' + error.message);
    }

    setUploading(false);
  };

  const validCount = validationResults.filter(r => r.isValid).length;
  const invalidCount = validationResults.length - validCount;

  return (
    <div className="space-y-6">
      {/* Download Template */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border-2 border-green-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-600 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Step 1: Download Template</h3>
              <p className="text-sm text-slate-600">Get the pre-formatted Excel template</p>
            </div>
          </div>
          <button
            onClick={generateExcelTemplate}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold shadow-lg"
          >
            <Download className="w-5 h-5" />
            Download Template
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <Upload className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900">Step 2: Upload Filled Template</h3>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-3 border-dashed rounded-2xl p-12 text-center transition-all ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => handleFileUpload(e.target.files[0])}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          
          <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h4 className="text-xl font-bold text-slate-900 mb-2">
            {file ? file.name : 'Drop Excel file here or click to browse'}
          </h4>
          <p className="text-sm text-slate-600">
            Supports .xlsx and .xls files (max 1000 rows)
          </p>
        </div>
      </div>

      {/* Preview Table */}
      {validationResults.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border-2 border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Step 3: Review & Submit</h3>
              <p className="text-sm text-slate-600 mt-1">
                <span className="text-green-600 font-semibold">{validCount} valid</span>
                {invalidCount > 0 && (
                  <>, <span className="text-red-600 font-semibold">{invalidCount} invalid</span></>
                )}
              </p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={validCount === 0 || uploading}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Create {validCount} Payouts
                </>
              )}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Row</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">User ID</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Payment</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Name</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Amount</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Status</th>
                  <th className="text-left py-3 px-3 font-bold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {validationResults.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`border-b border-slate-100 ${
                      !row.isValid ? 'bg-red-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-3 font-mono text-xs">{row.rowNumber}</td>
                    <td className="py-3 px-3 font-mono text-xs">{row.userId}</td>
                    <td className="py-3 px-3">
                      {row.upiId ? (
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-4 h-4 text-purple-600" />
                          <span className="font-mono text-xs">{row.upiId}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span className="font-mono text-xs">{row.accountNumber}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">{row.accountHolderName}</td>
                    <td className="py-3 px-3 font-bold">Rs.{row.amount.toLocaleString()}</td>
                    <td className="py-3 px-3">
                      {row.isValid ? (
                        <span className="flex items-center gap-1 text-green-600 font-semibold">
                          <CheckCircle className="w-4 h-4" />
                          Valid
                        </span>
                      ) : (
                        <div className="group relative">
                          <span className="flex items-center gap-1 text-red-600 font-semibold cursor-help">
                            <XCircle className="w-4 h-4" />
                            Invalid
                          </span>
                          <div className="absolute left-0 top-full mt-2 w-64 bg-slate-900 text-white text-xs p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            {row.errors.map((err, i) => (
                              <div key={i}>• {err}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => removeRow(row.rowNumber)}
                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelTab;