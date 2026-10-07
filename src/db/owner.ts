// Row adoption removed: assigning NULL-owned rows to the first authenticated user
// leaks data across accounts. All writes now require a non-null userId up front.
