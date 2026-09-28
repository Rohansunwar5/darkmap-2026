import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export const exportExcel = (data, name) => {
    const workbook = XLSX.utils.book_new();
    Object.entries(data).forEach(([name, sheet]) => {
        console.log(sheet)
        const worksheet = XLSX.utils.aoa_to_sheet(sheet);
        XLSX.utils.book_append_sheet(workbook, worksheet, name);
    })
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    saveAs(blob, `${name}.xlsx`);
};