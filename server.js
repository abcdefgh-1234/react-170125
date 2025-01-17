const express = require('express');
const cors = require('cors');
const db = require('./db'); // MySQL connection

const app = express();
const port = 5000;

// let unique_id = null;
app.use(cors());
app.use(express.json()); // Parse JSON bodies



// Route to handle client data
app.post('/api/client-info', (req, res) => {
  const { systemData, networkInterfaces } = req.body;

  // Check if the required data exists
  if (!systemData || !networkInterfaces || networkInterfaces.length === 0) {
      return res.status(400).json({ error: 'Missing system or network data' });
  }

  // Sanitize system data
  const sanitizedSystemData = {
      hostname: systemData.hostname || null,
  };

  // Loop through network interfaces and insert each one
  const values = networkInterfaces.map((network) => {
      return [
          sanitizedSystemData.hostname,
          network.ipAddress || null,
          network.macAddress || null,
      ];
  });


  const checkDuplicateQuery = `
  SELECT hostname, ip_address, mac_address
  FROM client
  WHERE hostname = ? AND ip_address = ? AND mac_address = ?`


  const uniqueValues = [];
  const checkDuplicates = values.map((value) => {
      return new Promise((resolve, reject) => {
          db.query(checkDuplicateQuery, value, (err, results) => {
              if (err) return reject(err);
              if (results.length === 0) {
                  // No duplicate found, add to uniqueValues
                  uniqueValues.push(value);
              }
              resolve();
          });
      });
  });

  // Once all duplicates are checked, insert unique values
  Promise.all(checkDuplicates)
      .then(() => {
          if (uniqueValues.length === 0) {
              return res.status(200).json({ message: 'No new data to insert, duplicates found' });
          }

          // Insert only unique values
          const insertQuery = `
              INSERT INTO client (hostname, ip_address, mac_address) VALUES ?
          `;
          db.query(insertQuery, [uniqueValues], (err, result) => {
              if (err) {
                  console.error('Error inserting into client table:', err);
                  return res.status(500).json({ error: 'Failed to insert data into client table' });
              }
              const clientId = result.insertId;
              res.status(200).json({ client_id: clientId, message: 'Client info inserted successfully' });
          });
      })
      .catch((err) => {
          console.error('Error checking for duplicates:', err);
          res.status(500).json({ error: 'Failed to check for duplicates' });
      });




//   const query = `INSERT INTO client (hostname, ip_address, mac_address) VALUES ?`;

//   db.query(query, [values], (err, result) => {
//       if (err) {
//           console.error('Error inserting in client table:', err);
//           return res.status(500).json({ error: 'Failed to insert data into client table' });
//       }
//       const clientId = result.insertId;
//       res.status(200).json({ client_id: clientId }); // Send client_id back to renderer
//   });
});

// Endpoint to insert system info
app.post('/api/system-info', (req, res) => {
  const { clientId, systemData } = req.body;

  if (!clientId || !systemData) {
      return res.status(400).json({ error: 'Missing client ID or system data' });
  }

  const values = [
      clientId,
      systemData.hostname || null,
      systemData.totalMemory || null,
      systemData.freeMemory || null,
      systemData.release || null,
      systemData.type || null,
      systemData.arch || null,
  ];

  const query = `INSERT INTO sys_info (client_id, hostname, tmemory, fmemory, sys_release, sys_type, sys_arch) VALUES (?)`;

  db.query(query, [values], (err, result) => {
      if (err) {
          console.error('Error inserting in sys_info table:', err);
          return res.status(500).json({ error: 'Failed to insert data into sys_info table' });
      }
      res.status(200).json({ message: 'System info inserted successfully' });
  });
});




// To handle network data
app.post('/api/network-info', (req, res) => {
  const { clientId, networkData } = req.body;
  if (!clientId || !networkData || networkData.length === 0) {
      return res.status(400).json({ error: 'Missing client ID or network data' });
  }
  const values = networkData.map((network) => [
      clientId,
      network.interfaceName || null,
      network.ipAddress || null,
      network.macAddress || null,
  ]);
  const query = `INSERT INTO network_info (client_id, interface, ip_address, mac_address) VALUES ?`;
  db.query(query, [values], (err, result) => {
      if (err) {
          console.error('Error inserting in network_info table:', err);
          return res.status(500).json({ error: 'Failed to insert data into network_info table' });
      }
      res.status(200).json({ message: 'Network info inserted successfully' });
  });
});

// To post the patch updates
app.post('/api/patch-info', (req, res) => {
    const { clientId, patchData } = req.body;

    const query = `INSERT INTO patch_updates (client_id, hotfix_id, description, installed_on, installed_by) VALUES ?`;
    const values = patchData.map(patch => [
        clientId,
        patch.hotFixID || null,
        patch.description || null,
        patch.installedOn || null,
        patch.installedBy || null,
    ]);

    db.query(query, [values], err => {
        if (err) {
            console.error('Error inserting in patch_info table:', err);
            return res.status(500).json({ error: 'Failed to insert data into network_info table' });
        }
        res.status(200).json({ message: 'Patch info inserted successfully' });
    });
});



// To post Installed software data

app.post('/api/software_info', (req, res) => {
    const { UID, softwareData } = req.body;

    // Validate request body
    if (!UID || !softwareData) {
      return res.status(400).json({ error: "UID and softwareData are required." });
    }
  
    try {
      // Convert the software data to a JSON string for storage
      const softwareBlob = JSON.stringify(softwareData);
  
      // SQL query to insert data into the database
      const query = `
        INSERT INTO active_process (UID, software_data)
        VALUES (?, ?)
      `;
  
      // Execute the query
      db.query(query, [UID, softwareBlob], (err, result) => {
        if (err) {
          console.error("Error inserting software data into the database:", err);
          return res.status(500).json({ error: "Database insertion failed." });
        }
  
        console.log("Software data inserted successfully:", result);
        res.status(200).json({ message: "Software data inserted successfully.", result });
      });
    } catch (error) {
      console.error("Error processing software data:", error);
      res.status(500).json({ error: "Internal server error." });
    }
});


// Route to handle network data
// app.post('/api/network-info', (req, res) => {
//     const networkData = req.body.networkData;
    
//     // Insert network data into MySQL (network table)
//     const query = 'INSERT INTO network (interface, ip_address, mac_address) VALUES (?, ?, ?)';
//     const promises = networkData.map(interface => {
//         return db.execute(query, [interface.interfaceName, interface.ipAddress, interface.macAddress,]);
//     });

//     Promise.all(promises)
//         .then(() => res.send('Network data inserted successfully!'))
//         .catch(err => res.status(500).send(err));
// });



//to handle unique data
// app.post('/api/unique_info', (req, res) => {
//     // Get the data from the request body
//     const {CPUid, MBid, MACAddr, Hash}= req.body;

//     if (!CPUid || !MBid || !MACAddr || !Hash) {
//         return res.status(400).json({ error: 'Missing required fields in the request body' });
//     }
  
    
//     const query = `
//       INSERT INTO unique_info (CPUid, MBid, MACAddr, hash)
//       VALUES (?, ?, ?, ?)
//     `;

//     db.query(query, [CPUid, MBid, MACAddr, Hash], (err, result) => {
//         if (err) {
//           console.error('Error inserting data into the database:', err);
//           return res.status(500).json({ error: 'Database insertion failed' });
//         }
    
//         console.log('Unique data inserted successfully:');
//         res.status(200).json({ message: 'Data inserted in unique_info successfully', result });
//     });
  

// });

app.post('/api/unique_info', (req, res) => {
    // Get the data from the request body
    const {UID, SI}= req.body;
  
    
    const query = `
      INSERT INTO unique_info (UID, CPUid, MBid, MACAddr, hash)
      VALUES (?)
    `;

    const values =[
        UID,
        SI.CPUid || null,
        SI.MBid || null,
        SI.MACAddr|| null,
        SI.Hash || null,
    ];

    db.query(query, [values], (err, result) => {
        if (err) {
          console.error('Error inserting data into the database:', err);
          return res.status(500).json({ error: 'Database insertion failed' });
        }
    
        console.log('Unique data inserted successfully:');
        res.status(200).json({ message: 'Data inserted in unique_info successfully', result });
    });
  

});

// to post the anti virus info

app.post('/api/antivirus_info', (req, res) => {
    const { UID, AV} = req.body; // Direct object fields

    const query = `
      INSERT INTO antivirus_info (UID, name, version, vendor, caption)
      VALUES (?)
    `;

    const values =[
        UID,
        AV.name || null,
        AV.version || null,
        AV.publisher|| null,
        AV.refer || null,
    ];
  
  
    db.query(query, [values], (err, result) => {
      if (err) {
        console.error('Error inserting antivirus data into the database:', err);
        return res.status(500).json({ error: 'Database insertion failed' });
      }
  
      console.log('Antivirus data inserted successfully:', result);
      res.status(200).json({ message: 'Antivirus data inserted successfully'});
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
