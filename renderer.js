const { ipcRenderer } = require('electron');


let isSystemInfoFetched = false;
let isNetworkInfoFetched = false;
let isPatchDataFetched = false;

let clientId = null;
// System Info

if(!isSystemInfoFetched){
  ipcRenderer.once('system-info', (event, systemInfo) => {
      isSystemInfoFetched = true;


      // First, fetch client info and save the client ID
      // fetchClientInfo(systemInfo)
      //     .then(() => {
      //         // Send system info after client ID is available
      //         fetchSystemInfo(systemInfo);

      //           if (Array.isArray(systemInfo.patches) && systemInfo.patches.length > 0) {
      //             fetchPatchInfo(systemInfo.patches);
      //           }
                
  
      //           // Optionally send other data (e.g., network info)
      //           if (systemInfo.networkInterfaces && systemInfo.networkInterfaces.length > 0) {
      //               fetchNetworkInfo(systemInfo.networkInterfaces);
      //           }
      //       })
      //       .catch(error => console.error('Error during fetch operations:', error));
      const systemInfoContainer = document.getElementById('system-info');
      systemInfoContainer.innerHTML = `
          <p><strong>Platform:</strong> ${systemInfo.platform}</p>
          <p><strong>Architecture:</strong> ${systemInfo.arch}</p>
          <p><strong>CPUs:</strong> ${systemInfo.cpus}</p>
          <p><strong>Total Memory:</strong> ${formatBytes(systemInfo.totalMemory)}</p>
          <p><strong>Free Memory:</strong> ${formatBytes(systemInfo.freeMemory)}</p>
          <p><strong>Hostname:</strong> ${systemInfo.hostname}</p>
          <p><strong>Release:</strong> ${systemInfo.release}</p>
          <p><strong>Type:</strong> ${systemInfo.type}</p>
          <p><strong>Uptime:</strong> ${formatUptime(systemInfo.uptime)}</p>
      `;
  });
}





// function fetchClientInfo(systemInfo) {
//   return fetch('http://10.1.32.92:5000/api/client-info', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ systemData: systemInfo, networkInterfaces: systemInfo.networkInterfaces })
//   })
//       .then((response) => response.json())
//       .then((data) => {
//           if (data.client_id) {
//               clientId = data.client_id; // Save client_id for subsequent API calls
//               console.log('Client ID received:', clientId);
//           } else {
//               console.error('Failed to retrieve client_id');
//           }
//       })
//       .catch((error) => console.error('Error sending client info:', error));
// }


// Function to fetch system information
// function fetchSystemInfo(systemInfo) {
//   if (!clientId) {
//       console.error('Client ID is not available for system info');
//       return;
//   }

//   fetch('http://10.1.32.92:5000/api/system-info', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ clientId, systemData: systemInfo })
//   })
//       .then(() => {
//           console.log('System info sent successfully');
//       })
//       .catch((error) => console.error('Error sending system info:', error));
// }

// // Function to fetch network information
// function fetchNetworkInfo(networkInfo) {
//   if (!clientId) {
//       console.error('Client ID is not available for network info');
//       return;
//   }

//   fetch('http://10.1.32.92:5000/api/network-info', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ clientId, networkData: networkInfo })
//   })
//       .then(() => {
//           console.log('Network info sent successfully');
//       })
//       .catch((error) => console.error('Error sending network info:', error));
// }


// // Function to fetch patch information
// function fetchPatchInfo(patchesInfo) {
//   if (!clientId) {
//       console.error('Client ID is not available for patch data');
//       return;
//   }

//   if (!Array.isArray(patchesInfo) || patchesInfo.length === 0) {
//     console.error('No patches to send.');
//     return;
//   }

//   return fetch('http://10.1.32.92:5000/api/patch-info', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ clientId, patchData: patchesInfo })
//   })
//       .then(() => {
//           console.log('Patch data sent successfully');
//       })
//       .catch(error => console.error('Error sending patch data:', error));
// }


// Patch Updates
ipcRenderer.on('system-info', (event, systemInfo) => {
  const patchTable = document.getElementById('patch-table');

  if (patchTable && !isPatchDataFetched) {
      isPatchDataFetched = true; // Prevent duplicate sending

      patchTable.innerHTML = ''; // Clear previous content

      if (Array.isArray(systemInfo.patches) && systemInfo.patches.length > 0) {
          systemInfo.patches.forEach(patch => {
              const row = document.createElement('tr');
              row.innerHTML = `
                  <td>${patch.hotFixID || 'N/A'}</td>
                  <td>${patch.description || 'N/A'}</td>
                  <td>${patch.installedOn || 'N/A'}</td>
                  <td>${patch.installedBy || 'N/A'}</td>
              `;
              patchTable.appendChild(row);
          });

          // Send patches to the database
      } else {
          const row = document.createElement('tr');
          row.innerHTML = `
              <td colspan="4">No patches found.</td>
          `;
          patchTable.appendChild(row);
      }
  }
});



// To display the CPU Information

ipcRenderer.on('cpu-info', (event, data) => {
  console.log('Received CPU Info:', data); // Log the received CPU info for debugging

  const lines = data.split('\n').filter(line => line.trim().length > 0);
  const cpuData = lines.slice(1); // Skip the header row

  const tableBody = document.querySelector('#cpuTable tbody');
  cpuData.forEach((line) => {
      // Split by multiple spaces or tabs
      const columns = line.trim().split(/\s{2,}/); // This splits by two or more spaces
      if (columns.length === 3) {  // Ensure there are exactly 3 columns
          const [processorId, name, manufacturer] = columns;
          const row = tableBody.insertRow();
          row.insertCell(0).textContent = processorId;
          row.insertCell(1).textContent = name;
          row.insertCell(2).textContent = manufacturer;
      }
  });
});



// To display the motherboard information

document.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('load-baseboard-info');
});

// Handle the baseboard info response
ipcRenderer.on('motherboard-details', (event, details) => {
  const outputDiv = document.getElementById('motherboard_output');
  outputDiv.textContent = details || 'No details found';
});



// installed softwares
ipcRenderer.on('software-data', (event, softwareData) => {
  if (!clientId) {
      console.error('Client ID is not available for software info');
      return;
  }

  // Insert software data into the database
  fetch('http://10.1.32.92:5000/api/software-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, softwareData })
  })
  .then(() => {
      console.log('Software data sent successfully');
  })
  .catch((error) => console.error('Error sending software data:', error));
});




// Network Info
if (document.getElementById('network-info')) {
    ipcRenderer.send('request-system-info');
    ipcRenderer.once('system-info', (event, systemInfo) => {
      if(!isNetworkInfoFetched){
        isNetworkInfoFetched = true;
        const networkInfoContainer = document.getElementById('network-info');
        if (systemInfo.networkInterfaces.length > 0) {
            networkInfoContainer.innerHTML = `
                <h3>Network Interfaces:</h3>
                <h2> ${systemInfo.networkInterfaces.interfaceName}</h2>
                <ul>
                    ${systemInfo.networkInterfaces.map(interface => `
                        <li>
                            <strong>Interface Name:</strong> ${interface.interfaceName}<br>
                            <strong>MAC Address:</strong> ${interface.macAddress}<br>
                            <strong>IP Address:</strong> ${interface.ipAddress}
                        </li>
                    `).join('')}
                </ul>
            `;
        }

        } else {
            networkInfoContainer.innerHTML = `<p>No network interfaces found.</p>`;
        }
    });
    
}



//verifying the update from the CSV file



document.addEventListener('DOMContentLoaded', () => {
  const resultDiv = document.getElementById('patch-info');

  // Automatically fetch information
  resultDiv.innerText = 'Fetching Hotfix information...';
  ipcRenderer.send('fetch-hotfix-info');

  ipcRenderer.on('update-output', (event, data) => {
    if (data.error) {
      resultDiv.innerText = data.error;
    } else {
      resultDiv.innerHTML = `
        <p>Your last Update Hotfix ID is:<strong> ${data.hotfixID}</strong> and released on:<strong>${data.releaseDate}</strong></p>
        
        <p>Your last update was:<strong> ${data.diffInDays} days</strong> ago</p>
      `;
    }
    if(data.diffInDays>14){
      const updInfo = document.getElementById('update-info');
      updInfo.innerHTML=`<p><strong>Update the system to continue</strong></p>`
    }
  });
});



// Installed Software
// ipcRenderer.on('software-data', (event, data) => {
//     const tableBody = document.querySelector('#software-table tbody');
//     tableBody.innerHTML = ''; // Clear existing rows

//     if (data.length === 0) {
//         const row = document.createElement('tr');
//         row.innerHTML = `
//             <td colspan="4">No software data available.</td>
//         `;
//         tableBody.appendChild(row);
//     } else {
//         data.forEach(software => {
//             const row = document.createElement('tr');
//             row.innerHTML = `
//                 <td>${software.Name || 'N/A'}</td>
//                 <td>${software.InstallLocation || 'N/A'}</td>
//                 <td>${software.InstallDate || 'N/A'}</td>
//                 <td>${software.Version || 'N/A'}</td>
//             `;
//             tableBody.appendChild(row);
//         });
//     }
//     insertSoftwareInfo(softwareData);
// });



function insertSoftwareInfo(softwareData) {
  // Send the data to the backend API to insert into MySQL
  fetch('http://10.1.32.92:5000/api/software-info', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      softwareData: softwareData, // Data to be inserted
    }),
  })
  .then(response => response.json())
  .then(data => {
    console.log('Software info inserted successfully:', data);
  })
  .catch(error => {
    console.error('Error inserting software info:', error);
  });
}


ipcRenderer.send('fetch-motherboard-info');
ipcRenderer.on('baseboard-info', (event, result) => {
  const tableBody = document.querySelector('#baseboardTable tbody');
  tableBody.innerHTML = ''; // Clear existing rows

  if (result.error) {
      tableBody.innerHTML = `<tr><td colspan="3">Error: ${result.error}</td></tr>`;
      return;
  }

  const { columns, data } = result;

  // Insert headers dynamically
  const tableHead = document.querySelector('#baseboardTable thead');
  tableHead.innerHTML = ''; // Clear existing headers
  const headerRow = tableHead.insertRow();
  columns.forEach(column => {
      const cell = document.createElement('th');
      cell.textContent = column;
      headerRow.appendChild(cell);
  });

  // Insert data rows
  data.forEach(row => {
      const tableRow = tableBody.insertRow();
      row.forEach(cellData => {
          const cell = tableRow.insertCell();
          cell.textContent = cellData;
      });
  });
});



//Processor

ipcRenderer.send('fetch-processor-info');
ipcRenderer.on('processor-info', (event, result) => {
  const tableBody = document.querySelector('#processorTable tbody');
  tableBody.innerHTML = ''; // Clear existing rows

  if (result.error) {
      tableBody.innerHTML = `<tr><td colspan="3">Error: ${result.error}</td></tr>`;
      return;
  }

  const { columns, data } = result;

  // Insert headers dynamically
  const tableHead = document.querySelector('#processorTable thead');
  tableHead.innerHTML = ''; // Clear existing headers
  const headerRow = tableHead.insertRow();
  columns.forEach(column => {
      const cell = document.createElement('th');
      cell.textContent = column;
      headerRow.appendChild(cell);
  });

  // Insert data rows
  data.forEach(row => {
      const tableRow = tableBody.insertRow();
      row.forEach(cellData => {
          const cell = tableRow.insertCell();
          cell.textContent = cellData;
      });
  });
});

// Display the installed softwares (Faster)
ipcRenderer.send('fetch-installed-software');
ipcRenderer.on('installed-software-data', (event, response) => {
  const outputElement = document.getElementById('software-output');

  if (response.error) {
    outputElement.innerHTML = `<p class="error">Error: ${response.error}</p>`;
    return;
  }

  if (response.data && response.data.length > 0) {
    const headers = ['Display Name', 'Display Version', 'Publisher'];
    const tableHeaders = headers.map(header => `<th>${header}</th>`).join('');
    const tableRows = response.data.map(
      software => `
        <tr>
          <td>${software.displayName}</td>
          <td>${software.displayVersion}</td>
          <td>${software.publisher}</td>
        </tr>
      `
    ).join('');

    outputElement.innerHTML = `
      <table>
        <thead>
          <tr>
            ${tableHeaders}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  } else {
    outputElement.innerHTML = '<p>No installed software information found.</p>';
  }
});






//anti virus 2 inforamtion

ipcRenderer.on('antivirus-data', (event, response) => {
  const antivirusContainer = document.getElementById('antivirus-details');

  if (response.error) {
    antivirusContainer.innerHTML = `<p>Error: ${response.error}</p>`;
    return;
  }

  if (response.data && response.data.length > 0) {
    antivirusContainer.innerHTML = response.data
      .map(item => `
        <div class="antivirus-item">
          <p><strong>Name:</strong> ${item.displayName || 'Unknown'}</p>
          <p><strong>Version:</strong> ${item.displayVersion || 'Unknown'}</p>
        </div>
      `)
      .join('');
  } else {
    antivirusContainer.innerHTML = `<p>No antivirus software found.</p>`;
  }
});


//Currently running antivirus
ipcRenderer.send('fetch-running-antivirus');

// Handle the response from the main process
ipcRenderer.on('running-antivirus-data', (event, data) => {
  const antivirusOutputDiv = document.getElementById('antivirus-running');
  
  // Clear previous content
  antivirusOutputDiv.innerHTML = '';

  // Check for error in data
  if (data.error) {
    antivirusOutputDiv.innerHTML = `<div class="error-message"><strong>Error:</strong> ${data.error}</div>`;
    return;
  }

  // Check if there is no antivirus data
  if (data.data && data.data.length === 0) {
    antivirusOutputDiv.innerHTML = '<div class="no-data">No running antivirus processes found.</div>';
    return;
  }

  // Format the data into a readable format
  const formattedData = data.data
    .map((process, index) => {
      return `
        <div class="antivirus-running-process">
          <strong>Process ${index + 1}:</strong><br>
          <strong>Process Name:</strong> ${process.processName}<br>
          <strong>Process ID:</strong> ${process.processId}<br>
          <!--<strong>Process Description:</strong> ${process.processDescription || 'No description available'}<br>--!>
        </div>
      `;
    })
    .join('');

  // Append formatted data to the output div
  antivirusOutputDiv.innerHTML = formattedData;
});




// Fetching AV version from file.
ipcRenderer.on('officescan-data2', (event, antivirusData) => {
  const antivirusOutputDiv = document.getElementById('antivirus-output');
  const updInfo = document.getElementById('antivirus-update');

  if (antivirusData && antivirusData.length > 0) {
    antivirusOutputDiv.innerHTML = antivirusData
      .map(av => {
        if (av.version) {
          const date = av.version;

          const year = parseInt(date.substring(0, 4), 10);
          const month = parseInt(date.substring(4, 6), 10) - 1; // Months are 0-indexed in JavaScript
          const day = parseInt(date.substring(6, 8), 10);
          const hours = parseInt(date.substring(8, 10), 10);
          const minutes = parseInt(date.substring(10, 12), 10);
          const seconds = parseInt(date.substring(12, 14), 10);

          const actualDate = new Date(year, month, day, hours, minutes, seconds);
          const today = new Date();

          // Calculate the difference in milliseconds
          const differenceInMs = today - actualDate;

          // Convert milliseconds to more human-readable time units
          const days = Math.floor(differenceInMs / (1000 * 60 * 60 * 24));

          // Check if antivirus needs an update
          if (days > 14) {
            updInfo.innerHTML = `<p><strong>Update the antivirus to continue</strong></p>`;
          }

          return `<div><strong>${av.name}</strong>: last updated on ${actualDate.toLocaleString()} <br/> (${days} days ago)</div>`;
        } else {
          return `<div><strong>${av.name}</strong>: no version information available</div>`;
        }
      })
      .join('');
  } else {
    antivirusOutputDiv.innerHTML = `<div>No antivirus software found or no version information available.</div>`;
  }
});

// Handle OfficeScan software info
ipcRenderer.on('officescan-data', (event, result) => {
    const officeScanElement = document.getElementById('officescan-data');
  
    // Parse the PowerShell output to extract relevant fields
    const officeScanDetails = parsePowerShellOutput(result);
  
    if (officeScanDetails.length === 0) {
      officeScanElement.innerHTML = '<p>No OfficeScan software found.</p>';
      return;
    }
  
    // Display the details in a table
    officeScanElement.innerHTML = `
      <h2>OfficeScan Software Details</h2>
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th>Name</th>
            <th>Version</th>
            <th>Vendor</th>
            <th>Caption</th>
          </tr>
        </thead>
        <tbody>
          ${officeScanDetails.map(detail => `
            <tr>
              <td>${detail.Name || 'N/A'}</td>
              <td>${detail.Version || 'N/A'}</td>
              <td>${detail.Vendor || 'N/A'}</td>
              <td>${detail.Caption || 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
});

function parsePowerShellOutput(output) {
    const lines = output.split('\n').map(line => line.trim()).filter(line => line);
    const details = [];
    let current = {};
  
    // Parse each line
    lines.forEach(line => {
      if (line.startsWith('Name')) {
        if (Object.keys(current).length > 0) {
          details.push(current);
        }
        current = { Name: line.split(':').slice(1).join(':').trim() };
      } else if (line.startsWith('Version')) {
        current.Version = line.split(':').slice(1).join(':').trim();
      } else if (line.startsWith('Vendor')) {
        current.Vendor = line.split(':').slice(1).join(':').trim();
      } else if (line.startsWith('Caption')) {
        current.Caption = line.split(':').slice(1).join(':').trim();
      }
    });
  
    if (Object.keys(current).length > 0) {
      details.push(current);
    }
  
    return details;
}





// Utility functions
function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 3600));
    seconds %= (24 * 3600);
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

