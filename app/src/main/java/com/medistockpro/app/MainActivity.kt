package com.medistockpro.app

import android.os.Bundle
import android.util.Patterns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize()
                ) {
                    MediStockApp()
                }
            }
        }
    }
}

@Composable
fun MediStockApp() {

    var showLogin by remember { mutableStateOf(false) }
    var showDashboard by remember { mutableStateOf(false) }

    when {
        showDashboard -> {
            DashboardScreen()
        }

        showLogin -> {
            LoginScreen(
                onLoginSuccess = {
                    showDashboard = true
                },
                onCreateAccount = {
                    showLogin = false
                }
            )
        }

        else -> {
            RegistrationScreen(
                onRegistrationSuccess = {
                    showDashboard = true
                },
                onLogin = {
                    showLogin = true
                }
            )
        }
    }
}

@Composable
fun RegistrationScreen(
    onRegistrationSuccess: () -> Unit,
    onLogin: () -> Unit
) {

    var medicalName by remember { mutableStateOf("") }
    var ownerName by remember { mutableStateOf("") }
    var gstNumber by remember { mutableStateOf("") }
    var drugLicense by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }

    var errorMessage by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.Center
    ) {

        Text(
            text = "MediStock Pro",
            style = MaterialTheme.typography.headlineLarge
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Pharmacy Management System",
            style = MaterialTheme.typography.bodyLarge
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Create Medical Store Account",
            style = MaterialTheme.typography.headlineSmall
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = medicalName,
            onValueChange = { medicalName = it },
            label = { Text("Medical Store Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = ownerName,
            onValueChange = { ownerName = it },
            label = { Text("Owner Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = gstNumber,
            onValueChange = { gstNumber = it.uppercase() },
            label = { Text("GST Number") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = drugLicense,
            onValueChange = { drugLicense = it.uppercase() },
            label = { Text("Drug License Number") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = mobile,
            onValueChange = {
                if (it.length <= 10 && it.all { char -> char.isDigit() }) {
                    mobile = it
                }
            },
            label = { Text("Mobile Number") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Address") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation()
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = confirmPassword,
            onValueChange = { confirmPassword = it },
            label = { Text("Confirm Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation()
        )

        Spacer(modifier = Modifier.height(10.dp))

        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            label = { Text("Medical Store Address") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (errorMessage.isNotEmpty()) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error
            )

            Spacer(modifier = Modifier.height(10.dp))
        }

        Button(
            onClick = {

                errorMessage = when {
                    medicalName.isBlank() ->
                        "Medical Store Name is required"

                    ownerName.isBlank() ->
                        "Owner Name is required"

                    gstNumber.isBlank() ->
                        "GST Number is required"

                    drugLicense.isBlank() ->
                        "Drug License Number is required"

                    mobile.length != 10 ->
                        "Enter a valid 10 digit mobile number"

                    !Patterns.EMAIL_ADDRESS
                        .matcher(email)
                        .matches() ->
                        "Enter a valid email address"

                    password.length < 6 ->
                        "Password must contain at least 6 characters"

                    password != confirmPassword ->
                        "Passwords do not match"

                    address.isBlank() ->
                        "Medical Store Address is required"

                    else -> ""
                }

                if (errorMessage.isEmpty()) {
                    onRegistrationSuccess()
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Create Account")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onLogin,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Already have an account? Login")
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onCreateAccount: () -> Unit
) {

    var emailOrMobile by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.Center
    ) {

        Text(
            text = "MediStock Pro",
            style = MaterialTheme.typography.headlineLarge
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Medical Store Login",
            style = MaterialTheme.typography.headlineSmall
        )

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedTextField(
            value = emailOrMobile,
            onValueChange = { emailOrMobile = it },
            label = { Text("Email or Mobile Number") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation()
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (errorMessage.isNotEmpty()) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error
            )

            Spacer(modifier = Modifier.height(10.dp))
        }

        Button(
            onClick = {

                if (emailOrMobile.isBlank() || password.isBlank()) {
                    errorMessage = "All fields are required"
                } else {
                    errorMessage = ""
                    onLoginSuccess()
                }

            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Login")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onCreateAccount,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Create New Medical Store Account")
        }
    }
}

@Composable
fun DashboardScreen() {

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
    ) {

        Text(
            text = "MediStock Pro",
            style = MaterialTheme.typography.headlineLarge
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Dashboard",
            style = MaterialTheme.typography.headlineSmall
        )

        Spacer(modifier = Modifier.height(20.dp))

        DashboardCard(
            title = "Today's Sales",
            value = "₹0"
        )

        Spacer(modifier = Modifier.height(10.dp))

        DashboardCard(
            title = "Today's Purchase",
            value = "₹0"
        )

        Spacer(modifier = Modifier.height(10.dp))

        DashboardCard(
            title = "Today's Profit",
            value = "₹0"
        )

        Spacer(modifier = Modifier.height(10.dp))

        DashboardCard(
            title = "Total Medicines",
            value = "0"
        )

        Spacer(modifier = Modifier.height(10.dp))

        DashboardCard(
            title = "Low Stock",
            value = "0"
        )

        Spacer(modifier = Modifier.height(10.dp))

        DashboardCard(
            title = "Expiring Soon",
            value = "0"
        )
    }
}

@Composable
fun DashboardCard(
    title: String,
    value: String
) {

    Card(
        modifier = Modifier.fillMaxWidth()
    ) {

        Column(
            modifier = Modifier.padding(18.dp)
        ) {

            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge
            )

            Spacer(modifier = Modifier.height(5.dp))

            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall
            )
        }
    }
}