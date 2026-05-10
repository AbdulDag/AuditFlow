import base64

# Replace with a real syllabus PDF name from your folder
file_path = "MATH1210 - Course Outline - W26.pdf" 

with open(file_path, "rb") as f:
    encoded_string = base64.b64encode(f.read()).decode('utf-8')
    print(encoded_string) # Copy this output