const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const WMIClient = require('wmi-client');  // WMI query module
const os = require('os');
const wmi = require('node-wmi'); // Ensure this is correctly imported
const csvParser = require('csv-parser');
const fs = require('fs');
const moment = require('moment');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { resolve } = require('dns');

let clientId = null;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();  

  // Fetch the software details using WMI query and send data to renderer
  fetchOfficeScanSoftware(); // To find anti virus info
  // fetchSoftwareInfo();       // To get running software info
  fetchInstalledSoftware();
  getBaseboardInfo();
  getProcessorInfo();
  getLatestHotfix();
  fetchAntivirusDetails();
  fetchRunningAntivirusProcesses();


}

app.whenReady().then(() => {
  createWindow();

  getCpuId();
  getMBId();
  getMacAddr();
  setTimeout(async () => {
    fetchSoftwareInfo();
  },7000)
  

  setInterval(() => {
    fetchRunningAntivirusProcesses();
  }, 10000);

  setInterval(() => {
    fetchOfficeScanSoftware();
  }, 300000);

  ipcMain.on('fetch-running-antivirus', () => {
    fetchRunningAntivirusProcesses();
  });
  

  const systemInfo = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().map(cpu => cpu.model).join(', '),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    hostname: os.hostname(),
    release: os.release(),
    type: os.type(),
    uptime: os.uptime(),
    networkInterfaces: getNetworkInfo(),
    patches: getPatches()  // patches now holds a Promise
  };

  systemInfo.patches.then(patches => {
    systemInfo.patches = patches;

    mainWindow.webContents.on('did-finish-load', () => {
      console.log("Sending the system Information from main");
      fetchClientInfo(systemInfo);

      mainWindow.webContents.send('system-info', systemInfo);
    });
  }).catch(error => {
    console.error("Error fetching system info:", error);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

//Sending the client info
async function fetchClientInfo(systemInfo) {
  try {
    const response = await fetch('http://10.1.32.92:5000/api/client-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemData: systemInfo, networkInterfaces: systemInfo.networkInterfaces })
    });
    const data = await response.json();
    if (data.client_id) {
      clientId = data.client_id; // Save client_id for subsequent API calls
      console.log('Client ID received:', clientId);
    } else {
      console.error('Failed to retrieve client_id');
    }
  } catch (error) {
    return console.error('Error sending client info:', error);
  }
}



function getLatestHotfix() {
  exec('wmic qfe get HotFixID /format:csv', (error, stdout, stderr) => {
    if (error || stderr) {
      const errorMessage = `Error fetching hotfix ID: ${error || stderr}`;
      
      return;
    }

    const lines = stdout.trim().split('\n');
    const hotfixes = lines.slice(1).map(line => line.split(',').pop().trim());
    let latestHotfix = hotfixes.pop();

    if (latestHotfix) {
      latestHotfix = latestHotfix.replace('KB', ''); // Trim "KB" from Hotfix ID
      console.log(`Latest Hotfix ID (trimmed): ${latestHotfix}`);
      
      fetchReleaseDateFromCSV(latestHotfix);
    } else {
      console.log('No hotfixes found.');
      
    }
  });
}

// Fetch release date from the CSV file
function fetchReleaseDateFromCSV(hotfixID) {
  const csvFilePath = path.join(__dirname, 'patches.csv'); // Make sure the CSV file path is correct
  let patchFound = false;

  console.log('Reading CSV from:', csvFilePath); // Debug: Check the CSV file path

  // Create a readable stream for the CSV file
  const readStream = fs.createReadStream(csvFilePath)
    .pipe(csvParser()) // Parse the CSV
    .on('data', (row) => {
      console.log('Row:', row); // Debug: Log each row being parsed
      if (row.Article && row.Article.trim() === hotfixID) {
        patchFound = true;
        const releaseDate = row.Releasedate;
        

        const diffInDays = compareDates(releaseDate);

        // const message = `Hotfix ID: ${hotfixID}, Release Date: ${releaseDate}, Difference from today: ${diffInDays} days`;
        const message = {
          hotfixID: hotfixID,
          releaseDate: releaseDate,
          diffInDays: diffInDays,
        };
        console.log(message); // Debug: Log the message to the console

        sendToRenderer('update-output', message); // Send the message to the renderer
        readStream.destroy(); // Stop reading the CSV once we have found the Hotfix ID
      }
    })
    .on('end', () => {
      if (!patchFound) {
        const message = `Hotfix ID ${hotfixID} not found in the CSV file.`;
        console.log(message);
        sendToRenderer('update-output', message); // Send the not found message to the renderer
      }
    })
    .on('error', (err) => {
      console.error('Error reading the CSV file:', err);
      sendToRenderer('update-output', `Error reading the CSV file: ${err.message}`); // Send the error message to the renderer
    });
}

// Function to send data to the renderer
function sendToRenderer(channel, message) {
  if (mainWindow && mainWindow.webContents) {
    console.log(`Sending data to renderer (channel: ${channel}):`, message); // Debug log
    mainWindow.webContents.send(channel, message); // Send data to renderer
  } else {
    console.warn('MainWindow or WebContents is not available. Message not sent.'); // Handle the case where mainWindow is not available
  }
}


function compareDates(dateToCompare) {
  // Get today's date
  const today = new Date();
  
  // Parse the input date (e.g., "Aug 13, 2019")
  const compareDate = new Date(dateToCompare);
  
  // Check if the date was valid
  if (isNaN(compareDate)) {
    return "Invalid date format.";
  }
  
  // Calculate the time difference in milliseconds
  const diffInMs = today - compareDate;
  
  // Calculate the difference in various units
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  console.log(`${diffInDays} days`);
  return diffInDays;
}

ipcMain.on('fetch-hotfix-info', () => {
  // Automatically fetch the latest hotfix ID (assumed static for this example)
  const latestHotfixID = getLatestHotfix(); // Replace with logic to determine dynamically if needed
  fetchReleaseDateFromCSV(latestHotfixID);
});



//Getting anti virus information

function fetchAntivirusDetails() {
  return new Promise((resolve, reject) => {
    const command = `powershell -Command "Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like '*antivirus*' -or $_.DisplayName -like '*McAfee*' -or $_.DisplayName -like '*Avast*' -or $_.DisplayName -like '*Kaspersky*' -or $_.DisplayName -like '*Trend Micro*' } | Select-Object DisplayName, DisplayVersion"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing PowerShell command: ${error.message}`);
        // sendToRenderer('antivirus-data', { error: error.message });
        return;
      }
  
      if (stderr) {
        reject(`PowerShell stderr: ${stderr}`);
        // sendToRenderer('antivirus-data', { error: stderr });
        return;
      }
  
      try {
        const antivirusData = stdout
          .trim()
          .split('\n')
          .slice(2) // Skip headers
          .map(line => {
            const [displayName, displayVersion] = line.split(/\s{2,}/).map(item => item.trim());
            return { displayName, displayVersion };
          });
  
        console.log('Antivirus Details:', antivirusData); // Debug log
        // sendToRenderer('antivirus-data', { data: antivirusData });
        resolve(antivirusData);
        fetchAntivirusDetails2();
        
      } catch (parseError) {
        console.error('Error parsing PowerShell output:', parseError);
        sendToRenderer('antivirus-data', { error: 'Error parsing PowerShell output' });
      }
    });
  });
}


// getting the publisher and installed data
function fetchAntivirusDetails2() {
  return new Promise((resolve, reject) => {
    const command = `powershell -Command "Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like '*antivirus*' -or $_.DisplayName -like '*McAfee*' -or $_.DisplayName -like '*Avast*' -or $_.DisplayName -like '*Kaspersky*' -or $_.DisplayName -like '*Trend Micro*' } | Select-Object Publisher, URLInfoAbout"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing PowerShell command: ${error.message}`);
        // sendToRenderer('antivirus-data', { error: error.message });
        return;
      }
  
      if (stderr) {
        reject(`PowerShell stderr: ${stderr}`);
        // sendToRenderer('antivirus-data', { error: stderr });
        return;
      }
  
      try {
        const antivirusData = stdout
          .trim()
          .split('\n')
          .slice(2) // Skip headers
          .map(line => {
            const [displayPublisher, displayRef] = line.split(/\s{2,}/).map(item => item.trim());
            return { displayPublisher, displayRef };
          });
  
        console.log('Antivirus Details 2:', antivirusData); // Debug log
        // sendToRenderer('antivirus-data', { data: antivirusData });
        resolve(antivirusData);
      } catch (parseError) {
        reject('Error parsing PowerShell output:', parseError);
        // sendToRenderer('antivirus-data', { error: 'Error parsing PowerShell output' });
      }
    });
  });
}

processAntiVirusData();
async function processAntiVirusData(){
  try {
    const nameVersion = await fetchAntivirusDetails();
    const publisherDate = await fetchAntivirusDetails2();
    
    for (let i = 0; i < publisherDate.length; i++) {
      console.log("The name of AV is", publisherDate[i].displayPublisher);
      
      // Compile AV data
      const AVInfo = {
        name: nameVersion[i].displayName,
        version: nameVersion[i].displayVersion,
        publisher: publisherDate[i].displayPublisher,
        refer: publisherDate[i].displayRef,
      };
      console.log("The compiled AV data", AVInfo);

      // Send compiled data to the server
      setTimeout(() => {
        sendAVDataToServer(AVInfo,globalUID);
      },6000);
      
    }

  } catch (error) {
    console.error("Error collecting system information:", error);
  }
}
// Function to send data to the renderer
function sendToRenderer(channel, message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, message);
  } else {
    console.error('MainWindow or WebContents is not available.');
  }
}

//Sending the anti virus info to the server
async function sendAVDataToServer(antivirusData,globalUID) {
  try {
    const response = await fetch('http://10.1.32.92:5000/api/antivirus_info', {  // Fixing the endpoint to match your server code
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({UID:globalUID,AV:antivirusData}), // Send antivirusData directly
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Antivirus data sent to server successfully:', data);
  } catch (error) {
    console.error('Error sending antivirus data to server:', error);
  }
}
// module.exports = { fetchAntivirusDetails };



// Fetch OfficeScan software info using PowerShell
function fetchOfficeScanSoftware() {
  const command = `powershell -Command "Get-WmiObject -Class 'Win32_Product' -Namespace 'root\\cimv2' -ComputerName '.' -Filter \\\"Name like '%Officescan%' OR Name like '%Mcafee%' OR Name like '%avast%' OR Name like '%K7%' OR Name like '%Kaspersky%'\\\""`; 

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error executing PowerShell command: ${err}`);
      return;
    }
    
    if (stderr) {
      console.error(`PowerShell stderr: ${stderr}`);
      return;
    }

    try {
      const result = stdout; 
      mainWindow.webContents.send('officescan-data', result); 

      const antivirusList = parseAntivirusNames(stdout); // Parse names from the PowerShell output
      if (antivirusList.length > 0) {
        const antivirusData = fetchAntivirusVersion(antivirusList); // Fetch versions
        mainWindow.webContents.send('officescan-data2', antivirusData); 
      } else {
        mainWindow.webContents.send('officescan-data2', []); 
      }


    } catch (parseError) {
      console.error('Error parsing PowerShell output:', parseError);
    }
  });
}


function parseAntivirusNames(stdout) {
  const lines = stdout.split('\n');
  const antivirusNames = [];
  
  lines.forEach(line => {
    const match = line.match(/Name\s+:\s+(.*)/i);
    if (match) {
      antivirusNames.push(match[1].trim());
    }
  });

  return antivirusNames;
}


function fetchAntivirusVersion(antivirusList) {
  const antivirusData = [];

  
  antivirusList.forEach(antivirus => {
    
    const programFilesPaths = [
      process.env['ProgramFiles'],                 
      process.env['ProgramFiles(x86)'],           
    ];

    let searchPath = '';
    let found = false;

    // Search for the 'ofcscan.ini' in the available program files directories
    programFilesPaths.forEach(programFilesPath => {
      if (programFilesPath) {
        
        searchPath = path.join(programFilesPath, 'Trend Micro', 'OfficeScan Client', 'activeupdate', 'Saf', 'ofcscan.ini');

        
        if (fs.existsSync(searchPath)) {
          found = true;
          const configContent = fs.readFileSync(searchPath, 'utf-8');

          
          const versionMatch = configContent.match(/Pattern_Last_Update\s*=\s*(.*)/i);

          if (versionMatch) {
            antivirusData.push({
              name: antivirus,
              version: versionMatch[1].trim(),
            });
          } else {
            console.warn(`Version not found in config.ini for ${antivirus}`);
          }
        }
      }
    });

    if (!found) {
      console.warn(`config.ini not found for ${antivirus}`);
    }
  });

  return antivirusData;
}

module.exports = {
  fetchOfficeScanSoftware,
  fetchAntivirusVersion,
};


function extractValueFromConfig(configData, searchKey) {
  const regex = new RegExp(`^${searchKey}\\s*=\\s*(\\S+)`, 'm');
  const match = configData.match(regex);
  return match ? match[1] : null;
}


//Currently running antivirus 

function fetchRunningAntivirusProcesses() {
  const command = `powershell -Command "Get-Process | Where-Object { $_.ProcessName -match 'avast|kaspersky|mcafee|trendmicro|norton|antivirus|pccNTMon|TmsaInstance64|CNTAoSMgr|TmListen|Ntrtscan|TmccsF|Tmpfw|tmwscsvc' } | Select-Object ProcessName, Id, Description"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing PowerShell command: ${error.message}`);
      mainWindow.webContents.send('running-antivirus-data', { error: error.message });
      return;
    }

    if (stderr) {
      console.error(`PowerShell stderr: ${stderr}`);
      mainWindow.webContents.send('running-antivirus-data', { error: stderr });
      return;
    }

    try {
      // Process the PowerShell output
      const lines = stdout.trim().split('\n').filter(line => line.length > 0);

      // Skip the first line (usually a header or unwanted first process)
      const processLines = lines.slice(1); // This skips the first line in the output

      if (processLines.length === 0) {
        mainWindow.webContents.send('running-antivirus-data', { data: [] });
        return;
      }

      // Extract process details from the PowerShell output
      const processInfo = processLines.map(line => {
        // Match process name, ID, and description based on column positions
        const match = line.match(/^(\S+)\s+(\d+)\s+(.*)$/); // Regular expression to match ProcessName, ProcessId, Description
        
        if (match) {
          const processName = match[1];
          const processId = match[2];
          const processDescription = match[3].trim();

          return {
            processName: processName || 'Unknown',
            processId: processId || 'Unknown',
            processDescription: processDescription || 'No description available',
          };
        }

        return null; // If no match, return null (this case should be handled)
      }).filter(info => info !== null); // Filter out any null results (in case of unmatched lines)

      // Send the data to the renderer process
      mainWindow.webContents.send('running-antivirus-data', { data: processInfo });
    } catch (parseError) {
      console.error('Error parsing PowerShell output:', parseError);
      mainWindow.webContents.send('running-antivirus-data', { error: 'Error parsing PowerShell output' });
    }
  });
}





function getNetworkInfo() {
  const networkInterfaces = os.networkInterfaces();
  const interfaces = [];

  for (let interfaceName in networkInterfaces) {
    networkInterfaces[interfaceName].forEach(interfaceDetails => {
      if (interfaceDetails.family === 'IPv4' && interfaceDetails.internal === false) {
        interfaces.push({
          interfaceName: interfaceName,
          macAddress: interfaceDetails.mac,
          ipAddress: interfaceDetails.address
        });
      }
    });
  }

  return interfaces;
}

// Patch updates
function getPatches() {
  if (os.platform() !== 'win32') {
    return Promise.resolve('Patch information not available for this platform.');
  }

  return new Promise((resolve, reject) => {
    wmi.Query({
      class: 'Win32_QuickFixEngineering'
    }, (err, result) => {
      if (err) {
        reject('Failed to retrieve patch information');
      } else {
        if (result && result.length > 0) {
          const patches = result.map(patch => {
            return {
              description: patch.Description,
              installedOn: patch.InstalledOn,
              hotFixID: patch.HotFixID,
              installedBy: patch.InstalledBy,
            };
          });
          resolve(patches);
        } else {
          resolve('No patches found.');
        }
      }
    });
  });
}





// Function to fetch baseboard info
function getBaseboardInfo() {
  const command = `powershell.exe -Command "Get-WmiObject Win32_BaseBoard | Select-Object Manufacturer, Product, SerialNumber"`;

  exec(command, (error, stdout, stderr) => {
      if (error) {
          console.error(`Baseboard Info Error: ${error}`);
          mainWindow.webContents.send('baseboard-info', { error: error.message });
          return;
      }
      if (stderr) {
          console.error(`Baseboard Info Stderr: ${stderr}`);
          mainWindow.webContents.send('baseboard-info', { error: stderr });
          return;
      }

      // Clean and format output
      const lines = stdout.split('\n').map(line => line.trim()).filter(line => line);
      const [headers, ...data] = lines; // Headers and data separation

      const columns = headers.split(/\s{2,}/).filter(Boolean);
      const parsedData = data.map(row =>
          row.split(/\s{2,}/).filter(Boolean)
      );

      // Send data to renderer
      mainWindow.webContents.send('baseboard-info', { columns, data: parsedData });
  });
}

ipcMain.on('fetch-motherboard-info', () => {
  getBaseboardInfo();
});


//processor info
function getProcessorInfo() {
  const command = `powershell.exe -Command "Get-WmiObject Win32_Processor | Select-Object Name, Manufacturer, ProcessorId"`;

  exec(command, (error, stdout, stderr) => {
      if (error) {
          console.error(`Processor Info Error: ${error}`);
          mainWindow.webContents.send('processor-info', { error: error.message });
          return;
      }
      if (stderr) {
          console.error(`Processor Info Stderr: ${stderr}`);
          mainWindow.webContents.send('processor-info', { error: stderr });
          return;
      }

      // Clean and format the output
      const lines = stdout.split('\n').map(line => line.trim()).filter(line => line);
      const [headers, ...data] = lines; // Headers and data separation

      const columns = headers.split(/\s{2,}/).filter(Boolean);
      const parsedData = data.map(row =>
          row.split(/\s{2,}/).filter(Boolean)
      );

      // Send data to the renderer process
      mainWindow.webContents.send('processor-info', { columns, data: parsedData });
  });
}


ipcMain.on('fetch-processor-info', () => {
  getProcessorInfo();
});



// Getting the info about installed softwares

function fetchInstalledSoftware() {
  const command = `powershell -Command "Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName, DisplayVersion, Publisher"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing PowerShell command: ${error.message}`);
      mainWindow.webContents.send('installed-software-data', { error: error.message });
      return;
    }

    if (stderr) {
      console.error(`PowerShell stderr: ${stderr}`);
      mainWindow.webContents.send('installed-software-data', { error: stderr });
      return;
    }

    try {
      const lines = stdout.trim().split('\n').filter(line => line.length > 0);

      if (lines.length < 2) {
        mainWindow.webContents.send('installed-software-data', { data: [] });
        return;
      }

      const tableHeaders = lines[0].split(/\s{2,}/); // Extract headers
      const softwareData = lines.slice(2).map(line => {
        const values = line.split(/\s{2,}/).map(item => item.trim());
        return {
          displayName: values[0] || 'Unknown',
          displayVersion: values[1] || 'Unknown',
          publisher: values[2]  || 'Unknown',
        };
      });

      mainWindow.webContents.send('installed-software-data', { data: softwareData, headers: tableHeaders });
    } catch (parseError) {
      console.error('Error parsing PowerShell output:', parseError);
      mainWindow.webContents.send('installed-software-data', { error: 'Error parsing PowerShell output' });
    }
  });
}

// IPC listener to fetch installed software data
ipcMain.on('fetch-installed-software', () => {
  fetchInstalledSoftware();
});




// IPC listener to handle software data request
// ipcMain.on('request-software-info', (event) => {
//   fetchSoftwareInfo();
// });


//To get the CPU info

function getCpuId() {
  return new Promise((resolve, reject) => {
    exec('wmic cpu get ProcessorId', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`exec error: ${error}`));
      }
      if (stderr) {
        reject(new Error(`stderr: ${stderr}`));
      }

      const lines = stdout.split('\n').map(line => line.trim()).filter(line => line);
      const processorIdLine = lines[1]; 
      const processorId = processorIdLine.split(/\s+/)[0]; 

      resolve(processorId);
    });
  });
}


//getting mother boardId
function getMBId() {
  return new Promise((resolve, reject) => {
    exec('wmic baseboard get serialnumber', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`exec error: ${error}`));
      }
      if (stderr) {
        reject(new Error(`stderr: ${stderr}`));
      }

      const lines = stdout.split('\n').map(line => line.trim()).filter(line => line);
      const motherboardIdLine = lines[1];
      const motherboardId = motherboardIdLine.split(/\s+/)[0];

      resolve(motherboardId); 
    });
  });
}

//getting MAC Address

function getMacAddr() {
  const os = require('os'); // Import the 'os' module

  return new Promise((resolve, reject) => {
    const networkInterfaces = os.networkInterfaces();

    const macAddresses = [];
    for (let interfaceName in networkInterfaces) {
      networkInterfaces[interfaceName].forEach(interfaceDetails => {
        if (interfaceDetails.family === 'IPv4' && interfaceDetails.internal === false) {
          macAddresses.push(interfaceDetails.mac);
        }
      });
    }

    if (macAddresses.length === 0) {
      reject(new Error('No non-internal IPv4 addresses found'));
    } else {
      resolve(macAddresses[0]);
    }
  });
}

let globalHash = null;
let globalUID = null;


// taking the values to compute the hash
async function collectSystemInfo() {
  try {
    const cpuId = await getCpuId();
    const mBId = await getMBId();
    const MAC = await getMacAddr();

    const systemInfo = {
      cpuid: cpuId,
      MBid: mBId,
      MacAddr: MAC
    };

    // Call the hash computer
    const hash = computeHash(systemInfo,'-');
    console.log('The hash is '+hash); 
    globalHash = hash;

    const uniqueid = generateUniqueIdFromHash(hash);
    console.log('The unique id is'+uniqueid);
    globalUID = uniqueid;

    const newInfo = {
      CPUid: cpuId,
      MBid: mBId,
      MACAddr: MAC,
      Hash: hash
    }

    // To send to the server
    setTimeout(() => {
      sendUniqueDataToServer(newInfo,globalUID);
    },5000);

  } catch (error) {
    console.error("Error collecting system information:", error);
  }
}
collectSystemInfo();


setTimeout(() => {
  if (globalHash) {
    console.log('Global hash accessed later in the program:', globalHash);
    console.log('Global uniqueid accessed later in the program:',globalUID )
  } else {
    console.log('Global hash is not yet initialized.');
  }
}, 7000);



function computeHash(details, delimiter = '-') {

  console.log("CPU ID in CH:", details.cpuid);
  console.log("Motherboard ID in CH:", details.MBid);
  console.log("MAC Address in CH:", details.MacAddr);


  const combinedString = Object.values(details).join(delimiter);
  const hash = crypto.createHash('sha256').update(combinedString).digest('hex');
  return hash;
}

function generateUniqueIdFromHash(hash) {
  if (hash.length < 6) {
    throw new Error("Hash must be at least 6 characters long.");
  }

  // Take the first 10 characters of the hash to create a large number
  const partialHash = hash.substring(0, 10);

  // Convert the partial hash to a numeric value
  const numericValue = parseInt(partialHash, 16);

  // Limit the numeric value to a 6-digit range
  const uniqueId = (numericValue % 900000) + 100000; // Ensures it's in the range 100000-999999

  return uniqueId;
}



async function sendUniqueDataToServer(systemInfo,globalUID) {
  //   console.log("CPU ID in SD:", systemInfo.CPUid);
  // console.log("Motherboard ID in SD:", systemInfo.MBid);
  // console.log("MAC Address in SD:", systemInfo.MACAddr);
  // console.log("Hash in SD",systemInfo.Hash);
  try {
    const response = await fetch('http://10.1.32.92:5000/api/unique_info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({UID:globalUID ,SI:systemInfo}),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Data sent to server successfully:', data);
  } catch (error) {
    console.error('Error sending data to server:', error);
  }
}


// WMI querry to get running process
function fetchSoftwareInfo() {
  const client = new WMIClient({
    host: 'localhost',
    username: '', // Leave blank for local queries
    password: '', // Leave blank for local queries
  });

  console.log("Fetching the software info");
  const query = `SELECT Name, InstallLocation, InstallDate, Version FROM Win32_Product`;

  client.query(query, async function (err, result) {
    if (err) {
      console.error('WMI Query Error:', err);
      return;
    }

    if (result.length === 0) {
      console.log('No software found.');
      return;
    }

    console.log(`Found ${result.length} software items.`);

    // Send the result to the renderer process
    mainWindow.webContents.send('software-data', result);

    // Format and send the data to the server
    try {
      setTimeout(async () => {
        await sendSoftwareDataToServer(globalUID, result); // Send unique ID and software data
      }, 6000);
    } catch (error) {
      console.error('Error sending software data to the server:', error);
    }
  });
}

// Function to send software data to the server
async function sendSoftwareDataToServer(uniqueId, softwareData) {
  console.log("Sending software data to server...");

  const serverUrl = "http://10.1.32.92:5000/api/software_info"; // Server endpoint

  try {
    // Ensure the payload structure matches server expectations
    const payload = {
      UID: uniqueId,
      softwareData: JSON.stringify(softwareData), // Convert to JSON string if required
    };

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // Ensure JSON content type
      },
      body: JSON.stringify(payload), // Send the payload
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Software data sent to the server successfully:", data);
  } catch (error) {
    console.error("Error while sending software data:", error.message);
    throw error; // Optional: Re-throw for higher-level handling
  }
}