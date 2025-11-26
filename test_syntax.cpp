#include <iostream>
#include <vector>
#include <string>
#include <memory>

using namespace std;

// C++ class example
class Vehicle {
private:
    string brand;
    int year;
    
public:
    Vehicle(const string& b, int y) : brand(b), year(y) {}
    
    virtual void display() const {
        cout << "Brand: " << brand << ", Year: " << year << endl;
    }
    
    virtual ~Vehicle() = default;
};

class Car : public Vehicle {
private:
    int doors;
    
public:
    Car(const string& b, int y, int d) : Vehicle(b, y), doors(d) {}
    
    void display() const override {
        Vehicle::display();
        cout << "Doors: " << doors << endl;
    }
};

// Template function
template<typename T>
T max_value(T a, T b) {
    return (a > b) ? a : b;
}

// Lambda and modern C++ features
auto lambda_test = [](int x, int y) -> int {
    return x + y;
};

int main() {
    // Smart pointers
    unique_ptr<Car> myCar = make_unique<Car>("Toyota", 2024, 4);
    
    // Vector and auto
    vector<int> numbers = {1, 2, 3, 4, 5};
    
    for (auto num : numbers) {
        cout << num << " ";
    }
    cout << endl;
    
    // Template usage
    int maxInt = max_value(10, 20);
    double maxDouble = max_value(3.14, 2.71);
    
    cout << "Max int: " << maxInt << endl;
    cout << "Max double: " << maxDouble << endl;
    
    // Lambda usage
    int sum = lambda_test(5, 3);
    cout << "Lambda result: " << sum << endl;
    
    // Object usage
    myCar->display();
    
    // nullptr usage
    int* ptr = nullptr;
    
    if (ptr == nullptr) {
        cout << "Pointer is null" << endl;
    }
    
    return 0;
}
